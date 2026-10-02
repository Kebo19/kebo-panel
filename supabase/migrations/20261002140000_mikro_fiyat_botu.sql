-- 02.10.2026
-- Mikro fiyat botu: Supabase Edge Function "mikro-fiyat-guncelle" her sabah 08:47'de
-- Mikro e-Portal'a ayrı bir bot kullanıcısıyla girer, son 10 günün gelen faturalarını okur
-- ve stok_fiyatlar'ı günceller. Bilgisayarın açık olması gerekmez.
-- Bot kullanıcısının e-posta/parolası Edge Function secret'larında: MIKRO_EPOSTA, MIKRO_PAROLA.

-- 1) Çalışma kaydı (panelde "son otomatik güncelleme" satırı buradan)
create table if not exists public.stok_fiyat_bot_log (
  id bigint generated always as identity primary key,
  basladi timestamptz not null default now(),
  bitti timestamptz,
  durum text not null default 'calisiyor' check (durum in ('calisiyor', 'basarili', 'hata')),
  okunan_fatura int not null default 0,
  guncellenen int not null default 0,
  kontrol_gereken int not null default 0,
  mesaj text,
  detay jsonb
);
alter table public.stok_fiyat_bot_log enable row level security;
create policy stok_deger_okuma on public.stok_fiyat_bot_log for select to authenticated
  using ((select public.stok_deger_yetkili()));

-- 2) Zamanlayıcının fonksiyonu çağırırken kullandığı anahtar (vault'ta, kimse görmez)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'mikro_bot_anahtar') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'mikro_bot_anahtar',
      'Edge Function mikro-fiyat-guncelle çağrı anahtarı');
  end if;
end $$;

-- Edge Function gelen anahtarı bununla doğrular (sadece service_role çağırabilir)
create or replace function public.mikro_bot_anahtar_dogrula(p_anahtar text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from vault.decrypted_secrets
                  where name = 'mikro_bot_anahtar' and decrypted_secret = p_anahtar)
$$;
revoke all on function public.mikro_bot_anahtar_dogrula(text) from public, anon, authenticated;
grant execute on function public.mikro_bot_anahtar_dogrula(text) to service_role;

-- 3) Panel için son çalışma
create or replace function public.stok_fiyat_bot_son()
returns table (basladi timestamptz, bitti timestamptz, durum text, okunan_fatura int,
               guncellenen int, kontrol_gereken int, mesaj text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.stok_deger_yetkili() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  return query select l.basladi, l.bitti, l.durum, l.okunan_fatura, l.guncellenen, l.kontrol_gereken, l.mesaj
    from public.stok_fiyat_bot_log l order by l.basladi desc limit 1;
end $$;
revoke all on function public.stok_fiyat_bot_son() from public, anon;
grant execute on function public.stok_fiyat_bot_son() to authenticated;

-- 4) Günlük zamanlama: her gün 08:47 (İstanbul) = 05:47 UTC
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('mikro-fiyat-guncelle', '47 5 * * *', $cron$
  select net.http_post(
    url := 'https://ktvarqdidplunhjcjpor.supabase.co/functions/v1/mikro-fiyat-guncelle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bot-anahtar', (select decrypted_secret from vault.decrypted_secrets where name = 'mikro_bot_anahtar')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$cron$);
