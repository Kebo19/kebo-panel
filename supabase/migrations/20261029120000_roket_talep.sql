-- Kasa raporunda "Roket'ten çek": panel bir istek yazar; Roket robotunun kurulu olduğu bilgisayarlardan
-- (dükkân ve/veya ev) hangisi açıksa birkaç saniye içinde alır, o günün Paket Raporu'nu Roket'ten çekip
-- roket_gunluk'a yazar. Panel isteği izler; bitince kurye satırlarını kendiliğinden doldurur.

create table if not exists public.roket_talepler (
  id uuid primary key default gen_random_uuid(),
  tarih date not null,
  isteyen uuid default auth.uid(),
  isteyen_ad text,
  istendi timestamptz not null default now(),
  basladi timestamptz,
  bitti timestamptz,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'calisiyor', 'bitti', 'hata')),
  bilgisayar text,
  mesaj text
);
create index if not exists roket_talepler_durum on public.roket_talepler (durum, istendi);
alter table public.roket_talepler enable row level security;
drop policy if exists roket_talep_oku on public.roket_talepler;
create policy roket_talep_oku on public.roket_talepler for select
  using (kebo_izin('rapor_gir') or kebo_izin('rapor_analiz') or kebo_izin('kasa'));

-- Robotun açık olduğu bilgisayarlar (dinleyici dakikada bir "buradayım" der)
create table if not exists public.roket_pc_durum (
  bilgisayar text primary key,
  son_gorulme timestamptz not null default now()
);
alter table public.roket_pc_durum enable row level security;
drop policy if exists roket_pc_oku on public.roket_pc_durum;
create policy roket_pc_oku on public.roket_pc_durum for select
  using (kebo_izin('rapor_gir') or kebo_izin('rapor_analiz') or kebo_izin('kasa'));

-- Panel: istek oluştur (aynı gün için bekleyen/süren istek varsa onu döner)
create or replace function public.roket_talep_olustur(p_tarih date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ad text;
begin
  if not (kebo_izin('rapor_gir') or kebo_izin('rapor_analiz')) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if p_tarih is null or p_tarih > (now() at time zone 'Europe/Istanbul')::date or p_tarih < date '2024-01-01' then
    raise exception 'Geçersiz tarih';
  end if;
  select id into v_id from public.roket_talepler
   where tarih = p_tarih and durum in ('bekliyor', 'calisiyor') order by istendi desc limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(nullif(full_name, ''), email) into v_ad from public.profiles where id = auth.uid();
  insert into public.roket_talepler (tarih, isteyen, isteyen_ad) values (p_tarih, auth.uid(), v_ad) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.roket_talep_olustur(date) from public, anon;
grant execute on function public.roket_talep_olustur(date) to authenticated;

-- Robot: nabız + sıradaki isteği al
create or replace function public.roket_pc_talep_al(p_anahtar text, p_bilgisayar text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tarih date;
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  insert into public.roket_pc_durum (bilgisayar, son_gorulme) values (left(coalesce(p_bilgisayar, '?'), 60), now())
  on conflict (bilgisayar) do update set son_gorulme = now()
   where roket_pc_durum.son_gorulme < now() - interval '50 seconds';
  update public.roket_talepler set durum = 'hata', bitti = now(),
         mesaj = 'Robot 6 dakikada bitiremedi (bilgisayar kapanmış ya da Roket yanıt vermemiş olabilir).'
   where durum = 'calisiyor' and basladi < now() - interval '6 minutes';
  update public.roket_talepler set durum = 'hata', bitti = now(),
         mesaj = 'Robotun kurulu olduğu bilgisayarlardan hiçbiri 30 dakikada isteği almadı.'
   where durum = 'bekliyor' and istendi < now() - interval '30 minutes';
  update public.roket_talepler set durum = 'calisiyor', basladi = now(), bilgisayar = left(p_bilgisayar, 60)
   where id = (select id from public.roket_talepler where durum = 'bekliyor' order by istendi limit 1 for update skip locked)
   returning id, tarih into v_id, v_tarih;
  if v_id is null then return jsonb_build_object('talep', null); end if;
  return jsonb_build_object('talep', v_id, 'tarih', v_tarih);
end $$;

create or replace function public.roket_pc_talep_bitir(p_anahtar text, p_id uuid, p_durum text, p_mesaj text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  update public.roket_talepler set durum = case when p_durum = 'bitti' then 'bitti' else 'hata' end,
         bitti = now(), mesaj = left(p_mesaj, 500)
   where id = p_id and durum = 'calisiyor';
end $$;

revoke all on function public.roket_pc_talep_al(text, text) from public;
revoke all on function public.roket_pc_talep_bitir(text, uuid, text, text) from public;
grant execute on function public.roket_pc_talep_al(text, text) to anon, authenticated;
grant execute on function public.roket_pc_talep_bitir(text, uuid, text, text) to anon, authenticated;
