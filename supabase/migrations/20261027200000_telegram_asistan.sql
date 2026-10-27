-- ─── TELEGRAM ASİSTANI ────────────────────────────────────────────────────────
-- Panel kullanıcıları Telegram'dan soru sorar, fotoğraf gönderir, sabah özeti alır.
-- Vercel'deki /api/telegram webhook'u veritabanına oturum açmadan, kurulumda üretilen
-- bir anahtarla (bot token'ından türetilir, burada sadece sha256 özeti saklanır) erişir.
-- Her istekte Telegram sohbeti → bağlı panel kullanıcısı bulunur ve o kullanıcının
-- yetkileri uygulanır (kasa raporu, cari, stok …). Bağlama: panelde tek kullanımlık kod.

create table if not exists public.telegram_ayar (
  id int primary key default 1 check (id = 1),
  anahtar_ozeti text not null,
  bot_kullanici text,
  kuran text,
  kuruldu timestamptz not null default now()
);
alter table public.telegram_ayar enable row level security;

create table if not exists public.telegram_baglantilar (
  chat_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_ad text,
  sabah_ozeti boolean not null default true,
  oglen_uyarisi boolean not null default true,
  created_at timestamptz not null default now(),
  son_mesaj timestamptz
);
alter table public.telegram_baglantilar enable row level security;
drop policy if exists tg_baglanti_kendi on public.telegram_baglantilar;
create policy tg_baglanti_kendi on public.telegram_baglantilar for select to authenticated using (user_id = auth.uid());
drop policy if exists tg_baglanti_guncelle on public.telegram_baglantilar;
create policy tg_baglanti_guncelle on public.telegram_baglantilar for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists tg_baglanti_sil on public.telegram_baglantilar;
create policy tg_baglanti_sil on public.telegram_baglantilar for delete to authenticated using (user_id = auth.uid());

create table if not exists public.telegram_kodlar (
  kod text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  son_gecerlilik timestamptz not null default now() + interval '15 minutes'
);
alter table public.telegram_kodlar enable row level security;

-- Telegram'dan gelen ve panelde açılacak fotoğraflar (kasa formu, irsaliye)
create table if not exists public.telegram_fotolar (
  id uuid primary key default gen_random_uuid(),
  grup text,                          -- aynı anda gönderilen fotoğraflar (ör. formun iki yüzü)
  tur text not null check (tur in ('kasa', 'irsaliye', 'sayim')),
  user_id uuid references auth.users(id) on delete set null,
  gonderen text,
  mime text not null default 'image/jpeg',
  veri text not null,                 -- base64
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'islendi')),
  created_at timestamptz not null default now()
);
create index if not exists telegram_fotolar_bekleyen on public.telegram_fotolar (tur, created_at) where durum = 'bekliyor';
alter table public.telegram_fotolar enable row level security;
drop policy if exists tg_foto_oku on public.telegram_fotolar;
create policy tg_foto_oku on public.telegram_fotolar for select to authenticated
  using (case tur when 'kasa' then public.kebo_izin('rapor_gir') else public.kebo_izin('stok') end);
drop policy if exists tg_foto_guncelle on public.telegram_fotolar;
create policy tg_foto_guncelle on public.telegram_fotolar for update to authenticated
  using (case tur when 'kasa' then public.kebo_izin('rapor_gir') else public.kebo_izin('stok') end);

-- Onay bekleyen işlem (ör. okunan sayım "Kaydet" butonunu bekliyor)
create table if not exists public.telegram_bekleyen (
  chat_id bigint primary key,
  islem text not null,
  veri jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.telegram_bekleyen enable row level security;

-- ── Yardımcılar ──
create or replace function public._tg_anahtar_dogru(p_anahtar text)
returns boolean language sql stable security definer set search_path to 'public', 'extensions' as $$
  select coalesce(length(p_anahtar) >= 32, false)
     and exists (select 1 from public.telegram_ayar where anahtar_ozeti = encode(extensions.digest(p_anahtar, 'sha256'), 'hex'))
$$;

create or replace function public._tg_izin(p_user uuid, p_izin text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select trim(role) = 'Tam Yetkili' or (trim(role) = 'Müdür' and p_izin = any(yetkiler))
                     from public.profiles where id = p_user), false)
$$;

create or replace function public._tg_kullanici(p_anahtar text, p_chat bigint)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid;
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select b.user_id into v from public.telegram_baglantilar b join public.profiles p on p.id = b.user_id
   where b.chat_id = p_chat and trim(p.role) in ('Tam Yetkili', 'Müdür');
  return v;
end $$;
revoke all on function public._tg_anahtar_dogru(text), public._tg_izin(uuid, text), public._tg_kullanici(text, bigint) from public, anon, authenticated;

-- ── Panel tarafı ──
-- Kurulum (Ayarlar > Telegram): sadece Tam Yetkili. Anahtarın özeti saklanır.
create or replace function public.tg_kurulum(p_anahtar text, p_bot text)
returns void language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and trim(role) = 'Tam Yetkili') then
    raise exception 'Telegram kurulumunu sadece Tam Yetkili yapabilir.' using errcode = '42501';
  end if;
  if length(coalesce(p_anahtar, '')) < 32 then raise exception 'Geçersiz anahtar'; end if;
  insert into public.telegram_ayar (id, anahtar_ozeti, bot_kullanici, kuran, kuruldu)
  values (1, encode(extensions.digest(p_anahtar, 'sha256'), 'hex'), p_bot, auth.jwt() ->> 'email', now())
  on conflict (id) do update set anahtar_ozeti = excluded.anahtar_ozeti, bot_kullanici = excluded.bot_kullanici,
                                 kuran = excluded.kuran, kuruldu = now();
end $$;
grant execute on function public.tg_kurulum(text, text) to authenticated;

create or replace function public.tg_durum()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('kurulu', exists (select 1 from public.telegram_ayar),
                            'bot', (select bot_kullanici from public.telegram_ayar),
                            'kuruldu', (select kuruldu from public.telegram_ayar))
$$;
grant execute on function public.tg_durum() to authenticated;

-- Bağlama kodu: kullanıcı panelde "Telegram'ı bağla" deyince üretilir, 15 dk geçerli
create or replace function public.tg_kod_olustur()
returns text language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and trim(role) in ('Tam Yetkili', 'Müdür')) then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  delete from public.telegram_kodlar where user_id = auth.uid() or son_gecerlilik < now();
  v := encode(extensions.gen_random_bytes(12), 'hex');
  insert into public.telegram_kodlar (kod, user_id) values (v, auth.uid());
  return v;
end $$;
grant execute on function public.tg_kod_olustur() to authenticated;

-- ── Bot tarafı (anahtarla) ──
create or replace function public.tg_baglan(p_anahtar text, p_chat bigint, p_kod text, p_ad text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_ad text;
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  delete from public.telegram_kodlar where kod = p_kod and son_gecerlilik >= now() returning user_id into v_user;
  if v_user is null then return jsonb_build_object('ok', false); end if;
  insert into public.telegram_baglantilar (chat_id, user_id, telegram_ad) values (p_chat, v_user, left(p_ad, 80))
  on conflict (chat_id) do update set user_id = excluded.user_id, telegram_ad = excluded.telegram_ad;
  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_ad from public.profiles where id = v_user;
  return jsonb_build_object('ok', true, 'ad', v_ad);
end $$;

create or replace function public.tg_ayril(p_anahtar text, p_chat bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  delete from public.telegram_baglantilar where chat_id = p_chat;
  delete from public.telegram_bekleyen where chat_id = p_chat;
end $$;

-- Sohbetin kullanıcısı ve yetkileri
create or replace function public.tg_kim(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); r jsonb;
begin
  if v is null then return null; end if;
  update public.telegram_baglantilar set son_mesaj = now() where chat_id = p_chat;
  select jsonb_build_object('user_id', p.id, 'ad', coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
           'kisa_ad', split_part(p.email, '@', 1), 'rol', trim(p.role),
           'yetkiler', to_jsonb(case when trim(p.role) = 'Tam Yetkili'
                                    then array['anasayfa','rapor_gir','rapor_duzenle','rapor_analiz','kasa','cari','kar_zarar','stok','recete','personel','puantaj','yonetim']
                                    else coalesce(p.yetkiler, '{}') end),
           'onayci', p.id = any (array['c4d199e9-e0b7-4d33-8ad8-556f7d488bac', 'e75d458f-1c36-405a-bd56-3c590c28cd54']::uuid[]))
    into r from public.profiles p where p.id = v;
  return r;
end $$;

-- Özet ve soru-cevap için veri: sadece kullanıcının yetkisi olan bölümler döner
create or replace function public.tg_veri(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); r jsonb := '{}'::jsonb;
begin
  if v is null then raise exception 'Bu Telegram hesabı panele bağlı değil.' using errcode = '42501'; end if;

  if public._tg_izin(v, 'anasayfa') or public._tg_izin(v, 'rapor_analiz') or public._tg_izin(v, 'kar_zarar') then
    r := r || jsonb_build_object('raporlar', coalesce((select jsonb_agg(to_jsonb(g) order by g.tarih)
      from public.gunluk_raporlar g where g.tarih >= current_date - 70), '[]'::jsonb));
  end if;

  if public._tg_izin(v, 'cari') then
    r := r || jsonb_build_object(
      'acik_faturalar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'cari_id', f.cari_id, 'cari_unvan', f.cari_unvan,
          'fatura_no', f.fatura_no, 'fatura_tarihi', f.fatura_tarihi, 'vade_tarihi', f.vade_tarihi, 'toplam_tutar', f.toplam_tutar, 'durum', f.durum))
        from public.faturalar f where f.durum <> 'odendi'), '[]'::jsonb),
      'bakiyeler', coalesce((select jsonb_agg(jsonb_build_object('cari_id', c.id, 'unvan', c.unvan, 'borc', k.borc, 'odenmis', k.odenmis,
          'hakedisten', coalesce(c.hakedisten_mahsup, false)))
        from (with f as (select cari_id, sum(toplam_tutar) top, sum(toplam_tutar) filter (where durum <> 'odendi') acik
                           from public.faturalar where cari_id is not null group by 1),
                   o as (select cari_id, sum(tutar) top from public.cari_odemeler where cari_id is not null group by 1)
              select f.cari_id, round(f.top - coalesce(o.top, 0), 2) borc,
                     round(greatest(0, coalesce(f.acik, 0) - greatest(0, f.top - coalesce(o.top, 0))), 2) odenmis
                from f left join o using (cari_id)) k
        join public.cariler c on c.id = k.cari_id), '[]'::jsonb),
      'son_odemeler', coalesce((select jsonb_agg(jsonb_build_object('tarih', o.tarih, 'cari', o.cari_unvan, 'tutar', o.tutar, 'yontem', o.odeme_yontemi) order by o.tarih desc)
        from public.cari_odemeler o where o.tarih >= current_date - 14 and o.odeme_yontemi is distinct from 'Devir'), '[]'::jsonb));
  end if;

  if public._tg_izin(v, 'stok') then
    r := r || jsonb_build_object(
      'stok_urunler', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'urun_adi', u.urun_adi, 'birim', u.birim, 'kategori', u.kategori,
          'min_stok', u.min_stok, 'mevcut_stok', u.mevcut_stok, 'sayim_periyodu', u.sayim_periyodu, 'sira_no', u.sira_no))
        from public.stok_urunler u where u.durum = 'aktif'), '[]'::jsonb),
      'stok_hareketler', coalesce((select jsonb_agg(jsonb_build_object('urun_id', h.urun_id, 'tarih', h.tarih, 'tip', h.tip, 'miktar', h.miktar,
          'vakit', h.vakit, 'neden', h.neden, 'kaynak', h.kaynak, 'created_at', h.created_at))
        from public.stok_hareketler h where h.tarih >= current_date - 120), '[]'::jsonb),
      'bot_log', coalesce((select jsonb_agg(jsonb_build_object('bitti', l.bitti, 'durum', l.durum, 'mesaj', l.mesaj,
          'guncellenen', l.detay -> 'guncellenen', 'kontrol', l.detay -> 'kontrol') order by l.id desc)
        from (select * from public.stok_fiyat_bot_log order by id desc limit 5) l), '[]'::jsonb),
      'telegram_bekleyen', (select count(*) from public.telegram_fotolar where durum = 'bekliyor' and tur <> 'kasa'));
  end if;

  if public._tg_izin(v, 'rapor_gir') then
    r := r || jsonb_build_object('telegram_kasa_bekleyen', (select count(*) from public.telegram_fotolar where durum = 'bekliyor' and tur = 'kasa'));
  end if;
  if public._tg_izin(v, 'rapor_duzenle') then
    r := r || jsonb_build_object('bekleyen_talepler', (select count(*) from public.rapor_degisiklik_talepleri where durum = 'bekliyor'));
  end if;
  return r;
end $$;

-- Bildirim alacak sohbetler (cron)
create or replace function public.tg_aboneler(p_anahtar text, p_tur text)
returns table (chat_id bigint) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query select b.chat_id from public.telegram_baglantilar b join public.profiles p on p.id = b.user_id
    where trim(p.role) in ('Tam Yetkili', 'Müdür')
      and case when p_tur = 'oglen' then b.oglen_uyarisi else b.sabah_ozeti end;
end $$;

create or replace function public.tg_bildirim_ayarla(p_anahtar text, p_chat bigint, p_sabah boolean, p_oglen boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public._tg_kullanici(p_anahtar, p_chat) is null then raise exception 'Bağlı değil'; end if;
  update public.telegram_baglantilar set sabah_ozeti = coalesce(p_sabah, sabah_ozeti), oglen_uyarisi = coalesce(p_oglen, oglen_uyarisi)
   where chat_id = p_chat;
end $$;

-- Onay bekleyen işlem
create or replace function public.tg_bekleyen_yaz(p_anahtar text, p_chat bigint, p_islem text, p_veri jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public._tg_kullanici(p_anahtar, p_chat) is null then raise exception 'Bağlı değil'; end if;
  if p_islem is null then delete from public.telegram_bekleyen where chat_id = p_chat; return; end if;
  insert into public.telegram_bekleyen (chat_id, islem, veri) values (p_chat, p_islem, coalesce(p_veri, '{}'::jsonb))
  on conflict (chat_id) do update set islem = excluded.islem, veri = excluded.veri, created_at = now();
end $$;

create or replace function public.tg_bekleyen_oku(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if public._tg_kullanici(p_anahtar, p_chat) is null then return null; end if;
  delete from public.telegram_bekleyen where created_at < now() - interval '1 day';
  select jsonb_build_object('islem', islem, 'veri', veri) into r from public.telegram_bekleyen where chat_id = p_chat;
  return r;
end $$;

-- Fotoğrafı panele gönder (kasa formu → Raporlar, irsaliye → Stok)
create or replace function public.tg_foto_kaydet(p_anahtar text, p_chat bigint, p_tur text, p_grup text, p_mime text, p_veri text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_id uuid; v_ad text;
begin
  if v is null then raise exception 'Bu Telegram hesabı panele bağlı değil.' using errcode = '42501'; end if;
  if not public._tg_izin(v, case p_tur when 'kasa' then 'rapor_gir' else 'stok' end) then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  if length(p_veri) > 8000000 then raise exception 'Fotoğraf çok büyük'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  insert into public.telegram_fotolar (grup, tur, user_id, gonderen, mime, veri)
  values (p_grup, p_tur, v, v_ad, coalesce(p_mime, 'image/jpeg'), p_veri) returning id into v_id;
  return v_id;
end $$;

-- Sayım kağıdından okunanları kaydet (sabah/akşam sayımı + fire). O gün kağıttan girilmiş fire tekrar düşülmez.
create or replace function public.tg_sayim_kaydet(p_anahtar text, p_chat bigint, p_tarih date, p_satirlar jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_ad text; s jsonb; n int := 0; atla int := 0; v_ek text;
begin
  if v is null then raise exception 'Bu Telegram hesabı panele bağlı değil.' using errcode = '42501'; end if;
  if not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  if p_tarih is null or p_tarih > current_date or p_tarih < current_date - 31 then raise exception 'Geçersiz tarih'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  for s in select * from jsonb_array_elements(coalesce(p_satirlar, '[]'::jsonb)) loop
    if not exists (select 1 from public.stok_urunler where id = (s ->> 'urun_id')::uuid) then continue; end if;
    v_ek := case when nullif(trim(s ->> 'not'), '') is not null then ' (' || left(trim(s ->> 'not'), 150) || ')' else '' end;
    if (s ->> 'sabah') is not null then
      insert into public.stok_hareketler (urun_id, tarih, tip, vakit, miktar, kaynak, kullanici, aciklama)
      values ((s ->> 'urun_id')::uuid, p_tarih, 'sayim', 'sabah', (s ->> 'sabah')::numeric, 'kagit', v_ad, 'Sayım kağıdı (Telegram)' || v_ek);
      n := n + 1;
    end if;
    if (s ->> 'aksam') is not null then
      insert into public.stok_hareketler (urun_id, tarih, tip, vakit, miktar, kaynak, kullanici, aciklama)
      values ((s ->> 'urun_id')::uuid, p_tarih, 'sayim', 'aksam', (s ->> 'aksam')::numeric, 'kagit', v_ad, 'Sayım kağıdı (Telegram)' || v_ek);
      n := n + 1;
    end if;
    if coalesce((s ->> 'fire')::numeric, 0) > 0 then
      if exists (select 1 from public.stok_hareketler where urun_id = (s ->> 'urun_id')::uuid and tarih = p_tarih and tip = 'cikis' and kaynak = 'kagit') then
        atla := atla + 1;
      else
        insert into public.stok_hareketler (urun_id, tarih, tip, neden, miktar, kaynak, kullanici, aciklama)
        values ((s ->> 'urun_id')::uuid, p_tarih, 'cikis', 'bozuk', (s ->> 'fire')::numeric, 'kagit', v_ad, 'Sayım kağıdı (fire, Telegram)' || v_ek);
        n := n + 1;
      end if;
    end if;
  end loop;
  delete from public.telegram_bekleyen where chat_id = p_chat;
  return jsonb_build_object('kayit', n, 'atlanan_fire', atla);
end $$;

grant execute on function
  public.tg_baglan(text, bigint, text, text), public.tg_ayril(text, bigint), public.tg_kim(text, bigint),
  public.tg_veri(text, bigint), public.tg_aboneler(text, text), public.tg_bildirim_ayarla(text, bigint, boolean, boolean),
  public.tg_bekleyen_yaz(text, bigint, text, jsonb), public.tg_bekleyen_oku(text, bigint),
  public.tg_foto_kaydet(text, bigint, text, text, text, text), public.tg_sayim_kaydet(text, bigint, date, jsonb)
to anon, authenticated;

create or replace function public.tg_bildirim_durum(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public._tg_kullanici(p_anahtar, p_chat) is null then return null; end if;
  return (select jsonb_build_object('sabah', sabah_ozeti, 'oglen', oglen_uyarisi) from public.telegram_baglantilar where chat_id = p_chat);
end $$;
grant execute on function public.tg_bildirim_durum(text, bigint) to anon, authenticated;
