-- Sayım listeleri: "envanter" grubu (demirbaş: bilgisayar, buzdolabı… yılda 1-2 kez sayılır) ve
-- sayım yeri (Dondurucu, Kuru depo…): kağıt listeler yere göre gruplanır, sayım tek turda yapılır.
alter table public.stok_urunler add column if not exists sayim_yeri text;
comment on column public.stok_urunler.sayim_periyodu is 'gunluk | haftalik | aylik | envanter. Haftalık liste günlükleri de, aylık liste günlük+haftalıkları da içerir.';
comment on column public.stok_urunler.sayim_yeri is 'Sayım kağıdında gruplama için yer (ör. Dondurucu, Kuru depo). Boşsa gruplanmaz.';

-- Telegram'daki sayım kağıdı okuma da yer gruplamasını bilsin (kağıttaki numaralar aynı olsun)
do $$
declare d text := pg_get_functiondef('public.tg_veri'::regproc);
begin
  if position('sayim_yeri' in d) = 0 then
    d := replace(d, '''sira_no'', u.sira_no))', '''sira_no'', u.sira_no, ''sayim_yeri'', u.sayim_yeri))');
    execute d;
  end if;
end $$;
