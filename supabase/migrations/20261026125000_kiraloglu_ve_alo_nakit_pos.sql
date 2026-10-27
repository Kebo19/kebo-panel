-- (canlı veritabanına 26.10.2026'da uygulandı)
-- Kıraloğlu markası: Chick'N Fride (os_cnf_* / ko_cnf_*) alanlarının aynısı
alter table public.gunluk_raporlar
  add column if not exists os_kir_ys numeric default 0,
  add column if not exists os_kir_ys_paket integer default 0,
  add column if not exists os_kir_ys_indirim numeric default 0,
  add column if not exists os_kir_trendyol numeric default 0,
  add column if not exists os_kir_trendyol_paket integer default 0,
  add column if not exists os_kir_trendyol_indirim numeric default 0,
  add column if not exists os_kir_migros_yemek numeric default 0,
  add column if not exists os_kir_migros_yemek_paket integer default 0,
  add column if not exists os_kir_migros_yemek_indirim numeric default 0,
  add column if not exists ko_kir_ys numeric default 0,
  add column if not exists ko_kir_ys_paket integer default 0,
  add column if not exists ko_kir_ys_indirim numeric default 0,
  add column if not exists ko_kir_trendyol numeric default 0,
  add column if not exists ko_kir_trendyol_paket integer default 0,
  add column if not exists ko_kir_trendyol_indirim numeric default 0,
  add column if not exists ko_kir_migros_yemek numeric default 0,
  add column if not exists ko_kir_migros_yemek_paket integer default 0,
  add column if not exists ko_kir_alo numeric default 0,
  add column if not exists ko_kir_alo_paket integer default 0;

-- Alo Paket kapıda tahsilatı nakit / POS olarak ayrı girilir; ko_kebo_alo = ikisinin toplamı (hesaplar onu kullanır)
alter table public.gunluk_raporlar
  add column if not exists ko_kebo_alo_nakit numeric default 0,
  add column if not exists ko_kebo_alo_pos numeric default 0;
