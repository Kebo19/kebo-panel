-- 28.10.2026: Token Flex yemek kartı
-- 1) Dükkân kasasındaki yemek kartlarına Token Flex eklendi.
alter table public.gunluk_raporlar add column if not exists kasa_tokenflex numeric default 0;

-- 2) ay_devir_durumu: yemek kartı satışlarına (alacak) kasadaki Token Flex ile kuryelerin kapıda
--    aldığı Token Flex / Paye Kart da girsin (sabit ve havuz kurye: hepsi bize yatar).
do $$
declare d text; y text;
begin
  select pg_get_functiondef('public.ay_devir_durumu(date)'::regprocedure) into d;
  if position('kasa_tokenflex' in d) > 0 then return; end if;
  y := replace(d, 'coalesce(kasa_multinet, 0)), 0)', 'coalesce(kasa_multinet, 0) + coalesce(kasa_tokenflex, 0)), 0)');
  y := replace(y, $a$into pos_satis, yk_satis from gunluk_raporlar where tarih >= bas and tarih < p_tarih;$a$,
    $b$into pos_satis, yk_satis from gunluk_raporlar where tarih >= bas and tarih < p_tarih;
  yk_satis := yk_satis + coalesce((select sum(coalesce(para_metni(x ->> 'tokenflex'), 0) + coalesce(para_metni(x ->> 'paye'), 0))
      from gunluk_raporlar g, jsonb_array_elements(coalesce(g.kurye_raporlari, '[]'::jsonb)) x
     where g.tarih >= bas and g.tarih < p_tarih), 0);$b$);
  if y = d or position('kasa_tokenflex' in y) = 0 or position($c$x ->> 'tokenflex'$c$ in y) = 0 then
    raise exception 'ay_devir_durumu beklenen biçimde değil, değiştirilmedi';
  end if;
  execute y;
end $$;
