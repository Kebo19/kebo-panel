-- ════════════════════════════════════════════════════════════════════════════
-- NAKİT KASA DEVİR / MUTABAKAT (canlıya uygulandı: nakit_kasa_devir, nakit_kasa_acilis,
-- nakit_kasa_acilis_aciklama)
-- Önceki günlerden kalan nakitten ödemeler ve bankaya yatırmalar günlük raporla
-- kaydedilir; günlük gider/ciroya karışmaz, Kasa & Finans'ta "Nakit" hareketi olur.
-- Gün sonu sayımı esas alınır; fark "Kasa sayım farkı" (ilk sayımda "Nakit kasa açılış").
-- ════════════════════════════════════════════════════════════════════════════

alter table public.gunluk_raporlar
  add column if not exists nakit_kasa_sayim numeric,
  add column if not exists nakit_devreden_kagit numeric;

alter table public.kasa_manuel_islemler
  add column if not exists rapor_id uuid references public.gunluk_raporlar(id) on delete cascade;
create index if not exists kasa_manuel_islemler_rapor_idx on public.kasa_manuel_islemler (rapor_id);

create or replace function public.nakit_kasa_bakiyesi(p_tarih date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select coalesce((select sum(coalesce(kasa_nakit, 0)) from public.gunluk_raporlar where tarih < p_tarih), 0)
       + coalesce((select sum(case
            when tip = 'gelir' and hesap = 'Nakit' then tutar
            when tip = 'gider' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hedef_hesap = 'Nakit' then tutar
            else 0 end)
          from public.kasa_manuel_islemler where islem_tarihi < p_tarih), 0)
    into v;
  return v;
end $$;
revoke all on function public.nakit_kasa_bakiyesi(date) from public, anon;
grant execute on function public.nakit_kasa_bakiyesi(date) to authenticated;

-- rapor_kaydet'e eklenen bloklar (fonksiyonun geri kalanı 20260925120000 ile aynı):
--
--  if v_ekler ? 'nakit_hareketleri' then
--    delete from kasa_manuel_islemler where rapor_id = v_id and kaynak = 'rapor_nakit';
--    insert ... tip = banka varsa 'transfer' (Nakit → banka) yoksa 'gider' ('Eski nakitten ödeme'),
--               kaynak 'rapor_nakit', rapor_id = v_id
--  end if;
--
--  delete from kasa_manuel_islemler where rapor_id = v_id and kaynak = 'rapor_sayim';
--  if nakit_kasa_sayim is not null then
--    v_beklenen := nakit_kasa_bakiyesi(v_tarih + 1);  v_fark := sayim - beklenen;
--    fark <> 0 ise: tip gelir/gider, hesap Nakit, kategori 'Kasa sayım farkı'
--      (daha önce sayım yoksa 'Nakit kasa açılış'), kaynak 'rapor_sayim', rapor_id = v_id
--  end if;

-- nakit_kasa_ilk_sayim_kontrolu: "ilk sayım" kontrolü Kasa & Finans'tan yapılan sayımları
-- (kategori 'Kasa sayım farkı' / 'Nakit kasa açılış') da dikkate alır.
