-- 31.10.2026: Kasa canlıya geçiş. Ekim deneme verisi arşivde kalır (silinmez); nakit kasa ve banka
-- bakiyeleri 1 Kasım 2026'dan (kasa_baslangic) itibaren sayılır. Açılış bakiyeleri o gün
-- "Açılış bakiyesi" kategorisiyle girilir. Ön yüzdeki karşılığı: lib/devir.ts KASA_BASLANGIC.
create or replace function public.kasa_baslangic() returns date
  language sql immutable as $$ select date '2026-11-01' $$;

create or replace function public.nakit_kasa_bakiyesi(p_tarih date)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v numeric;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select coalesce((select sum(coalesce(kasa_nakit, 0)) from public.gunluk_raporlar
                    where tarih < p_tarih and tarih >= public.kasa_baslangic()), 0)
       -- Sabit / kendi kuryelerin kapıda topladığı nakit kasaya girer; havuz Roadrunner'da kalır
       + coalesce((select sum(public.para_metni(x ->> 'nakit'))
            from public.gunluk_raporlar g, jsonb_array_elements(coalesce(g.kurye_raporlari, '[]'::jsonb)) x
           where g.tarih < p_tarih and g.tarih >= greatest(date '2026-09-28', public.kasa_baslangic())
             and coalesce(x ->> 'tip', '') <> 'havuz'), 0)
       + coalesce((select sum(case
            when tip = 'gelir' and hesap = 'Nakit' then tutar
            when tip = 'gider' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hedef_hesap = 'Nakit' then tutar
            else 0 end)
          from public.kasa_manuel_islemler where islem_tarihi < p_tarih and islem_tarihi >= public.kasa_baslangic()), 0)
    into v;
  return v;
end $function$;

-- (aynı gün, ikinci adım) Açılış bakiyesi gün başındaki paradır: 1 Kasım raporunun devreden nakdine de girer.
create or replace function public.nakit_kasa_bakiyesi(p_tarih date)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v numeric;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select coalesce((select sum(coalesce(kasa_nakit, 0)) from public.gunluk_raporlar
                    where tarih < p_tarih and tarih >= public.kasa_baslangic()), 0)
       + coalesce((select sum(public.para_metni(x ->> 'nakit'))
            from public.gunluk_raporlar g, jsonb_array_elements(coalesce(g.kurye_raporlari, '[]'::jsonb)) x
           where g.tarih < p_tarih and g.tarih >= greatest(date '2026-09-28', public.kasa_baslangic())
             and coalesce(x ->> 'tip', '') <> 'havuz'), 0)
       + coalesce((select sum(case
            when tip = 'gelir' and hesap = 'Nakit' then tutar
            when tip = 'gider' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hesap = 'Nakit' then -tutar
            when tip = 'transfer' and hedef_hesap = 'Nakit' then tutar
            else 0 end)
          from public.kasa_manuel_islemler
         where islem_tarihi >= public.kasa_baslangic()
           and (islem_tarihi < p_tarih or (islem_tarihi = p_tarih and kategori = 'Açılış bakiyesi'))), 0)
    into v;
  return v;
end $function$;
