-- Migros (online) indirimleri ve Alo Paket online satış (formda gri; yazılırsa işlenir)
alter table public.gunluk_raporlar
  add column if not exists os_kebo_migros_indirim numeric default 0,
  add column if not exists os_cnf_migros_yemek_indirim numeric default 0,
  add column if not exists os_kebo_alo numeric default 0,
  add column if not exists os_kebo_alo_paket integer default 0,
  add column if not exists os_kebo_alo_indirim numeric default 0;
