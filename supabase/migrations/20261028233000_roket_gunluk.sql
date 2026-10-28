-- 28.10.2026: Roket (Roadrunner kurye sistemi) Paket Raporu'nun GÜNLÜK ÖZETİ.
-- Excel Kurye Kontrol sayfasında tarayıcıda okunur; sadece kurye bazında paket ve
-- kapıda tahsilat toplamları kaydedilir (müşteri adı / telefon / adres kaydedilmez).
create table if not exists public.roket_gunluk (
  tarih date primary key,
  veri jsonb not null,            -- lib/roket.ts → RoketGun
  yukleyen text,
  yuklendi timestamptz not null default now()
);
alter table public.roket_gunluk enable row level security;
revoke all on public.roket_gunluk from anon;
drop policy if exists kebo_okuma on public.roket_gunluk;
create policy kebo_okuma on public.roket_gunluk for select to authenticated
  using ((select public.kebo_izin('rapor_gir')) or (select public.kebo_izin('rapor_analiz')) or (select public.kebo_izin('kasa')));
drop policy if exists kebo_yazma on public.roket_gunluk;
create policy kebo_yazma on public.roket_gunluk for insert to authenticated
  with check ((select public.kebo_izin('rapor_gir')) or (select public.kebo_izin('rapor_analiz')));
drop policy if exists kebo_guncelleme on public.roket_gunluk;
create policy kebo_guncelleme on public.roket_gunluk for update to authenticated
  using ((select public.kebo_izin('rapor_gir')) or (select public.kebo_izin('rapor_analiz')))
  with check ((select public.kebo_izin('rapor_gir')) or (select public.kebo_izin('rapor_analiz')));
