-- 01.10.2026: Kurye 1 ve 2 (sabit) kapıda tahsilatı gün sonu kasaya teslim eder.
-- Havuz kuryelerinin topladığı para Roadrunner'da kalır, ona olan borçtan düşülür;
-- ciroya yine eklenir ama nakit kasa beklentisine girmez.
-- Ayrıca para_metni: uygulama kurye tutarlarını "1250.5" biçiminde kaydediyor; nokta
-- artık yalnızca binlik grubu gibi duruyorsa (1.250 / 12.500.000) binlik ayracı sayılır.
create or replace function public.para_metni(p text) returns numeric language sql immutable as $$
  select case
    when s = '' then 0
    when s like '%,%' then nullif(replace(replace(s, '.', ''), ',', '.'), '')::numeric
    when s ~ '^-?\d{1,3}(\.\d{3})+$' then replace(s, '.', '')::numeric
    when s ~ '^-?\d+(\.\d+)?$' then s::numeric
    else 0 end
  from (select regexp_replace(coalesce(p, ''), '[\s₺]', '', 'g') as s) t
$$;

create or replace function public.nakit_kasa_bakiyesi(p_tarih date)
returns numeric language plpgsql stable security definer set search_path = public as $function$
declare v numeric;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select coalesce((select sum(coalesce(kasa_nakit, 0)) from public.gunluk_raporlar where tarih < p_tarih), 0)
       -- 28.09.2026'dan itibaren Kurye 1-2'nin (sabit/kendi) kapıda topladığı nakit kasaya girer; havuz Roadrunner'da kalır
       + coalesce((select sum(public.para_metni(x ->> 'nakit'))
            from public.gunluk_raporlar g, jsonb_array_elements(coalesce(g.kurye_raporlari, '[]'::jsonb)) x
           where g.tarih < p_tarih and g.tarih >= date '2026-09-28'
             and coalesce(x ->> 'tip', '') <> 'havuz'), 0)
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

-- ay_devir_durumu (yalnızca veritabanında tanımlı): nakit ve POS alacağında havuz kuryeleri hariç.
do $$
declare d text; y text;
begin
  select pg_get_functiondef('public.ay_devir_durumu(date)'::regprocedure) into d;
  y := replace(d,
    $a$where g.tarih < p_tarih and g.tarih >= date '2026-09-28'), 0);$a$,
    $b$where g.tarih < p_tarih and g.tarih >= date '2026-09-28' and coalesce(x ->> 'tip', '') <> 'havuz'), 0);$b$);
  y := replace(y,
    $a$where g.tarih >= bas and g.tarih < p_tarih), 0);$a$,
    $b$where g.tarih >= bas and g.tarih < p_tarih and g.tarih >= date '2026-09-28' and coalesce(x ->> 'tip', '') <> 'havuz'), 0);$b$);
  if y = d or (length(y) - length(d)) < 100 then raise exception 'ay_devir_durumu beklenen biçimde değil, değiştirilmedi'; end if;
  execute y;
end $$;
