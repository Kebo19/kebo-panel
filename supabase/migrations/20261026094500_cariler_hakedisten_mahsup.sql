-- Faturaları platform hakedişinden kesilen cariler (Yemeksepeti, Getir, Migros, Trendyol...).
-- Bu carilerin ödemeleri "Hakedişten Mahsup" ile kapanır; hesap boş kaldığı için kasaya yansımaz.
alter table public.cariler add column if not exists hakedisten_mahsup boolean not null default false;
comment on column public.cariler.hakedisten_mahsup is 'Faturaları platform hakedişinden kesilen cari (Yemeksepeti, Getir, Migros, Trendyol...). Ödemeleri kasaya yansımaz.';
update public.cariler set hakedisten_mahsup = true where unvan ~* '(yemek ?sepeti|getir|migros|trendyol)';
