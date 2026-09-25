-- Yeni yemek kartları: Setcard, Pluxee (eski Sodexo), Paye. Edenred ve Metropol zaten var.
alter table public.gunluk_raporlar
  add column if not exists kasa_setcard numeric default 0,
  add column if not exists kasa_pluxee numeric default 0,
  add column if not exists kasa_paye numeric default 0;
