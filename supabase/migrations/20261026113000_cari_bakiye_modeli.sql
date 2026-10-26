-- CARİ BAKİYE MODELİ (canlı veritabanına 26.10.2026'da uygulandı)
-- Borç = carinin tüm faturaları − tüm ödemeleri. Fatura durumları (ödendi/bekliyor) bu bakiyeden otomatik:
--   • bir ödemenin fatura_idleri listesindeki faturalar her zaman "ödendi",
--   • diğerlerinde ödemeler en eski faturayı kapatır: en yeni faturalar bakiye kadar açık kalır.
-- Geçişte kaydı girilmemiş geçmiş ödemeler için her cariye "Açılış düzeltmesi" (odeme_yontemi 'Devir') yazıldı;
-- önceki durumlar public.faturalar_durum_yedek_20261026 tablosunda.

create or replace function public.cari_durum_esitle(p_cari uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_borc numeric;
begin
  if p_cari is null then return; end if;
  perform set_config('kebo.durum_esitleniyor', '1', true);
  select coalesce((select sum(toplam_tutar) from faturalar where cari_id = p_cari), 0)
       - coalesce((select sum(tutar) from cari_odemeler where cari_id = p_cari), 0) into v_borc;
  with bagli as (
    select distinct unnest(fatura_idleri) as id from cari_odemeler where cari_id = p_cari and fatura_idleri is not null
  ), sirali as (
    select f.id, f.durum,
      coalesce(sum(f.toplam_tutar) over (order by f.fatura_tarihi desc, f.fatura_no desc, f.id desc
               rows between unbounded preceding and 1 preceding), 0) as onceki
    from faturalar f where f.cari_id = p_cari and f.id not in (select id from bagli)
  ), hedef as (
    select id, case when onceki < v_borc - 0.005 then (case when durum = 'gecikti' then 'gecikti' else 'bekliyor' end) else 'odendi' end as durum
      from sirali
    union all
    select f.id, 'odendi' from faturalar f join bagli b on b.id = f.id where f.cari_id = p_cari
  )
  update faturalar f set durum = h.durum, islendi = (h.durum = 'odendi')
    from hedef h where f.id = h.id and (f.durum is distinct from h.durum or f.islendi is distinct from (h.durum = 'odendi'));
  perform set_config('kebo.durum_esitleniyor', '0', true);
end $$;

create or replace function public.cari_durum_tetik()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('kebo.durum_esitleniyor', true), '0') = '1' then return null; end if;
  if tg_op in ('INSERT', 'UPDATE') then perform cari_durum_esitle(new.cari_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.cari_id is distinct from new.cari_id) then perform cari_durum_esitle(old.cari_id); end if;
  return null;
end $$;

drop trigger if exists trg_cari_durum on public.faturalar;
create trigger trg_cari_durum after insert or delete or update of toplam_tutar, cari_id, fatura_tarihi, fatura_no, durum, islendi
  on public.faturalar for each row execute function public.cari_durum_tetik();
drop trigger if exists trg_cari_durum on public.cari_odemeler;
create trigger trg_cari_durum after insert or delete or update of tutar, cari_id, fatura_idleri
  on public.cari_odemeler for each row execute function public.cari_durum_tetik();
