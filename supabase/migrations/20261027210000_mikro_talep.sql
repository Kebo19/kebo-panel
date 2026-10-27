-- ─── MİKRO: PANELDEN "ŞİMDİ ÇEK" ─────────────────────────────────────────────
-- Panelde (Faturalar / Fiyat Listesi) ya da Telegram'da (/mikro) "Mikro'dan çek" denince bir talep yazılır.
-- Dükkân bilgisayarındaki robot 5 dakikada bir kısa bir kontrol yapar (mikro_pc_nabiz): talep varsa hemen
-- Mikro'dan faturaları okur, carilere ve stok fiyatlarına işler, sonucu talebe yazar (mikro_pc_talep_bitir).
-- Bitince Telegram'a rapor gider (pg_net → /api/telegram/olay), panel de sonucu kendisi gösterir.

create table if not exists public.mikro_pc_talepler (
  id uuid primary key default gen_random_uuid(),
  isteyen uuid references auth.users(id) on delete set null,
  isteyen_ad text,
  chat_id bigint,
  istendi timestamptz not null default now(),
  basladi timestamptz,
  bitti timestamptz,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'calisiyor', 'bitti', 'hata')),
  mesaj text,
  sonuc jsonb
);
create index if not exists mikro_pc_talepler_istendi on public.mikro_pc_talepler (istendi desc);
alter table public.mikro_pc_talepler enable row level security;
drop policy if exists mikro_talep_oku on public.mikro_pc_talepler;
create policy mikro_talep_oku on public.mikro_pc_talepler for select to authenticated
  using (public.kebo_izin('stok') or public.kebo_izin('cari'));

create table if not exists public.mikro_pc_durum (
  id int primary key default 1 check (id = 1),
  son_gorulme timestamptz,
  bilgisayar text
);
alter table public.mikro_pc_durum enable row level security;

-- Talep raporu: talep + bu çalışmada Faturalar'a eklenen faturalar + son fiyat günlüğünün ayrıntısı
create or replace function public._mikro_talep_rapor(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'id', t.id, 'durum', t.durum, 'mesaj', t.mesaj, 'istendi', t.istendi, 'basladi', t.basladi, 'bitti', t.bitti,
    'isteyen_ad', t.isteyen_ad, 'sonuc', t.sonuc,
    'faturalar', coalesce((select jsonb_agg(jsonb_build_object('cari', f.cari_unvan, 'no', f.fatura_no, 'tarih', f.fatura_tarihi, 'tutar', f.toplam_tutar) order by f.fatura_tarihi, f.cari_unvan)
        from public.faturalar f
       where t.basladi is not null and f.created_at between t.basladi - interval '1 minute' and coalesce(t.bitti, now()) + interval '1 minute'
         and f.aciklama like 'Mikro e-Fatura:%'), '[]'::jsonb),
    'fiyat', (select jsonb_build_object('guncellenen', l.detay -> 'guncellenen', 'kontrol', l.detay -> 'kontrol', 'yeni_cari', l.detay -> 'yeni_cari')
        from public.stok_fiyat_bot_log l
       where t.basladi is not null and l.bitti between t.basladi - interval '1 minute' and coalesce(t.bitti, now()) + interval '1 minute'
       order by l.id desc limit 1))
  from public.mikro_pc_talepler t where t.id = p_id
$$;
revoke all on function public._mikro_talep_rapor(uuid) from public, anon, authenticated;

-- ── Panel ──
create or replace function public.mikro_talep_olustur()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_ad text;
begin
  if not (public.kebo_izin('stok') or public.kebo_izin('cari')) then raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501'; end if;
  select id into v_id from public.mikro_pc_talepler where durum in ('bekliyor', 'calisiyor') and istendi > now() - interval '2 hours' order by istendi desc limit 1;
  if v_id is null then
    select split_part(email, '@', 1) into v_ad from public.profiles where id = auth.uid();
    insert into public.mikro_pc_talepler (isteyen, isteyen_ad) values (auth.uid(), v_ad) returning id into v_id;
  end if;
  return public.mikro_durum();
end $$;

create or replace function public.mikro_durum()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not (public.kebo_izin('stok') or public.kebo_izin('cari')) then raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501'; end if;
  select id into v_id from public.mikro_pc_talepler order by istendi desc limit 1;
  return jsonb_build_object(
    'pc_son_gorulme', (select son_gorulme from public.mikro_pc_durum where id = 1),
    'son_calisma', (select jsonb_build_object('bitti', bitti, 'durum', durum, 'mesaj', mesaj) from public.stok_fiyat_bot_log order by id desc limit 1),
    'talep', case when v_id is null then null else public._mikro_talep_rapor(v_id) end);
end $$;
grant execute on function public.mikro_talep_olustur(), public.mikro_durum() to authenticated;

-- ── Telegram (/mikro) ──
create or replace function public.tg_mikro_talep(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_id uuid; v_ad text; v_yeni boolean := false;
begin
  if v is null then raise exception 'Bu Telegram hesabı panele bağlı değil.' using errcode = '42501'; end if;
  if not (public._tg_izin(v, 'stok') or public._tg_izin(v, 'cari')) then raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501'; end if;
  select id into v_id from public.mikro_pc_talepler where durum in ('bekliyor', 'calisiyor') and istendi > now() - interval '2 hours' order by istendi desc limit 1;
  if v_id is null then
    select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
    insert into public.mikro_pc_talepler (isteyen, isteyen_ad, chat_id) values (v, v_ad, p_chat) returning id into v_id;
    v_yeni := true;
  end if;
  return jsonb_build_object('yeni', v_yeni, 'pc_son_gorulme', (select son_gorulme from public.mikro_pc_durum where id = 1));
end $$;

-- Rapor gönderilecek sohbetler: Telegram'dan isteyen, panelden isteyenin bağlı Telegram'ları
create or replace function public.tg_mikro_rapor(p_anahtar text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t public.mikro_pc_talepler%rowtype;
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select * into t from public.mikro_pc_talepler where id = p_id;
  if not found then return null; end if;
  return public._mikro_talep_rapor(p_id) || jsonb_build_object('chatler', coalesce((
    select jsonb_agg(distinct c) from (
      select t.chat_id c where t.chat_id is not null
      union select b.chat_id from public.telegram_baglantilar b where b.user_id = t.isteyen and t.chat_id is null) x), '[]'::jsonb));
end $$;
grant execute on function public.tg_mikro_talep(text, bigint), public.tg_mikro_rapor(text, uuid) to anon, authenticated;

-- ── Dükkân robotu ──
-- 5 dakikada bir: "buradayım" der, bekleyen talep varsa alır (çalışıyor yapar). 20 dk'dan uzun süren talep hata sayılır.
create or replace function public.mikro_pc_nabiz(p_anahtar text, p_bilgisayar text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  insert into public.mikro_pc_durum (id, son_gorulme, bilgisayar) values (1, now(), left(p_bilgisayar, 60))
  on conflict (id) do update set son_gorulme = now(), bilgisayar = coalesce(excluded.bilgisayar, mikro_pc_durum.bilgisayar);
  update public.mikro_pc_talepler set durum = 'hata', bitti = now(), mesaj = 'Robot 20 dakikada bitiremedi (bilgisayar kapanmış ya da Mikro yanıt vermemiş olabilir).'
   where durum = 'calisiyor' and basladi < now() - interval '20 minutes';
  update public.mikro_pc_talepler set durum = 'calisiyor', basladi = now()
   where id = (select id from public.mikro_pc_talepler where durum = 'bekliyor' order by istendi limit 1)
   returning id into v_id;
  return jsonb_build_object('talep', v_id);
end $$;

create or replace function public.mikro_pc_talep_bitir(p_anahtar text, p_id uuid, p_durum text, p_mesaj text, p_sonuc jsonb)
returns void language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  update public.mikro_pc_talepler set durum = case when p_durum = 'bitti' then 'bitti' else 'hata' end, bitti = now(),
         mesaj = left(p_mesaj, 500), sonuc = p_sonuc
   where id = p_id and durum = 'calisiyor';
  if found and exists (select 1 from public.telegram_ayar) then
    begin
      perform net.http_post(url := 'https://kebo-panel.vercel.app/api/telegram/olay',
        body := jsonb_build_object('tur', 'mikro', 'id', p_id), headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then null;  -- bildirim gitmese de talep kapanır
    end;
  end if;
end $$;
grant execute on function public.mikro_pc_nabiz(text, text), public.mikro_pc_talep_bitir(text, uuid, text, text, jsonb) to anon, authenticated;
