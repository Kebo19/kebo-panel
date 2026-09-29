-- 28.09.2026'dan itibaren kuryelerin kapıda topladığı nakit kasaya girer: nakit_kasa_bakiyesi buna göre.
create or replace function public.para_metni(p text) returns numeric language sql immutable as $$
  select coalesce(nullif(replace(replace(regexp_replace(coalesce(p,''), '[\s₺]', '', 'g'), '.', ''), ',', '.'), '')::numeric, 0)
$$;
create or replace function public.nakit_kasa_bakiyesi(p_tarih date)
returns numeric language plpgsql stable security definer set search_path = public as $function$
declare v numeric;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select coalesce((select sum(coalesce(kasa_nakit, 0)) from public.gunluk_raporlar where tarih < p_tarih), 0)
       + coalesce((select sum(public.para_metni(x ->> 'nakit'))
            from public.gunluk_raporlar g, jsonb_array_elements(coalesce(g.kurye_raporlari, '[]'::jsonb)) x
           where g.tarih < p_tarih and g.tarih >= date '2026-09-28'), 0)
       + coalesce((select sum(case
            when tip = 'gelir' and hesap = 'Nakit' then tutar
            when tip = 'gider' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hedef_hesap = 'Nakit' then tutar
            else 0 end)
          from public.kasa_manuel_islemler where islem_tarihi < p_tarih), 0)
    into v;
  return v;
end $function$;
-- 29.09.2026: 1 Ekim öncesi raporlar, kasa hareketleri, stok hareketleri, puantaj, talepler ve sabit gider
-- tanımı silindi (yedek: yedek_20260929 şeması). Fatura, cari ve cari ödemeler korundu.
