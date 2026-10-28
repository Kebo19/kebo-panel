-- ─── KULLANICI YÖNETİMİ: ekleme, silme, şifre yenileme ─────────────────────
-- Ayarlar > Kullanıcılar ve yetkiler sayfası için. Hepsi veritabanı
-- fonksiyonu olarak çalışır (service_role anahtarı gerekmez) ve sadece
-- Tam Yetkili kullanıcılar çağırabilir (sifremi_degistir hariç: herkes kendi şifresini).
--
-- Şifreler Supabase'de geri çözülemez (bcrypt) saklanır. Yöneticinin verdiği
-- GEÇİCİ şifre ayrıca `kullanici_sifreleri` tablosunda tutulur ki yönetici
-- görebilsin; kullanıcı kendi şifresini değiştirince bu kayıt silinir.

alter table public.profiles add column if not exists sifre_degismeli boolean not null default false;

create table if not exists public.kullanici_sifreleri (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sifre text not null,
  belirleyen text,
  tarih timestamptz not null default now()
);
alter table public.kullanici_sifreleri enable row level security;
revoke all on public.kullanici_sifreleri from anon;
drop policy if exists kebo_okuma on public.kullanici_sifreleri;
create policy kebo_okuma on public.kullanici_sifreleri for select to authenticated
  using ((select public.kebo_tam_yetkili()));
-- Yazma politikası yok: sadece aşağıdaki fonksiyonlar yazar.

create or replace function public._kebo_sifre_kontrol(p_sifre text)
returns void language plpgsql immutable as $$
begin
  if p_sifre is null or length(p_sifre) < 8 then raise exception 'Şifre en az 8 karakter olmalı.'; end if;
  if length(p_sifre) > 72 then raise exception 'Şifre en fazla 72 karakter olabilir.'; end if;
end $$;

-- Yeni kullanıcı (Supabase Auth hesabı + profil) — sadece Tam Yetkili
create or replace function public.kullanici_olustur(p_email text, p_sifre text, p_ad text, p_rol text, p_yetkiler text[])
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  gecerli text[] := array['anasayfa','rapor_gir','rapor_duzenle','rapor_analiz','kasa','cari','kar_zarar',
                          'stok','recete','personel','personel_hassas','puantaj','puantaj_duzenle','yonetim'];
begin
  if not public.kebo_tam_yetkili() then
    raise exception 'Kullanıcıları sadece Tam Yetkili kullanıcılar ekleyebilir.' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Geçerli bir e-posta adresi girin.'; end if;
  if nullif(trim(p_ad), '') is null then raise exception 'Ad soyad girin.'; end if;
  perform public._kebo_sifre_kontrol(p_sifre);
  if p_rol not in ('Tam Yetkili', 'Müdür', 'Pasif') then raise exception 'Geçersiz rol: %', p_rol; end if;
  if exists (select 1 from unnest(coalesce(p_yetkiler, '{}')) y where y <> all(gecerli)) then
    raise exception 'Geçersiz yetki anahtarı.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Bu e-posta adresi zaten kayıtlı.';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_sifre, gen_salt('bf', 10)), now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          jsonb_build_object('full_name', trim(p_ad), 'email_verified', true), now(), now(),
          '', '', '', '', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', null, now(), now());

  insert into public.profiles (id, email, full_name, role, yetkiler, sifre_degismeli)
  values (v_id, v_email, trim(p_ad), p_rol,
          case when p_rol = 'Müdür'
               then coalesce((select array_agg(distinct y order by y) from unnest(p_yetkiler) y), '{}')
               else '{}' end,
          true);

  insert into public.kullanici_sifreleri (user_id, sifre, belirleyen)
  values (v_id, p_sifre, auth.jwt() ->> 'email');

  return v_id;
end $$;
revoke all on function public.kullanici_olustur(text, text, text, text, text[]) from public, anon;
grant execute on function public.kullanici_olustur(text, text, text, text, text[]) to authenticated;

-- Kullanıcıya yeni (geçici) şifre ver — sadece Tam Yetkili
create or replace function public.kullanici_sifre_belirle(p_id uuid, p_sifre text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_kendisi boolean := (p_id = auth.uid());
begin
  if not public.kebo_tam_yetkili() then
    raise exception 'Şifreleri sadece Tam Yetkili kullanıcılar yenileyebilir.' using errcode = '42501';
  end if;
  perform public._kebo_sifre_kontrol(p_sifre);
  update auth.users set encrypted_password = crypt(p_sifre, gen_salt('bf', 10)), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Kullanıcı bulunamadı.'; end if;

  if v_kendisi then
    -- Kendi şifresini buradan değiştiren yöneticinin oturumu açık kalır, şifre saklanmaz.
    delete from public.kullanici_sifreleri where user_id = p_id;
    update public.profiles set sifre_degismeli = false where id = p_id;
  else
    -- Kişinin açık oturumlarını kapat: yeni şifreyle tekrar girsin.
    delete from auth.sessions where user_id = p_id;
    delete from auth.refresh_tokens where user_id = p_id::text;
    insert into public.kullanici_sifreleri (user_id, sifre, belirleyen, tarih)
    values (p_id, p_sifre, auth.jwt() ->> 'email', now())
    on conflict (user_id) do update set sifre = excluded.sifre, belirleyen = excluded.belirleyen, tarih = excluded.tarih;
    update public.profiles set sifre_degismeli = true where id = p_id;
  end if;
end $$;
revoke all on function public.kullanici_sifre_belirle(uuid, text) from public, anon;
grant execute on function public.kullanici_sifre_belirle(uuid, text) to authenticated;

-- Kullanıcıyı tamamen sil — sadece Tam Yetkili; kendini ve son Tam Yetkili'yi silemez
create or replace function public.kullanici_sil(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  if not public.kebo_tam_yetkili() then
    raise exception 'Kullanıcıları sadece Tam Yetkili kullanıcılar silebilir.' using errcode = '42501';
  end if;
  if p_id = auth.uid() then raise exception 'Kendi hesabınızı silemezsiniz.'; end if;
  select trim(role) into v_rol from public.profiles where id = p_id;
  if v_rol = 'Tam Yetkili'
     and (select count(*) from public.profiles where trim(role) = 'Tam Yetkili') <= 1 then
    raise exception 'Son Tam Yetkili kullanıcı silinemez.';
  end if;
  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;  -- oturumlar, telegram bağlantısı, geçici şifre de silinir (cascade)
  if not found and v_rol is null then raise exception 'Kullanıcı bulunamadı.'; end if;
end $$;
revoke all on function public.kullanici_sil(uuid) from public, anon;
grant execute on function public.kullanici_sil(uuid) to authenticated;

-- Herkes kendi şifresini değiştirir (eski şifreyi doğrulayarak)
create or replace function public.sifremi_degistir(p_eski text, p_yeni text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if auth.uid() is null then raise exception 'Oturum bulunamadı, tekrar giriş yapın.'; end if;
  perform public._kebo_sifre_kontrol(p_yeni);
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if v_hash is null or v_hash <> crypt(coalesce(p_eski, ''), v_hash) then
    raise exception 'Mevcut şifreniz hatalı.';
  end if;
  if p_yeni = p_eski then raise exception 'Yeni şifre eskisiyle aynı olamaz.'; end if;
  update auth.users set encrypted_password = crypt(p_yeni, gen_salt('bf', 10)), updated_at = now()
   where id = auth.uid();
  delete from public.kullanici_sifreleri where user_id = auth.uid();
  update public.profiles set sifre_degismeli = false where id = auth.uid();
end $$;
revoke all on function public.sifremi_degistir(text, text) from public, anon;
grant execute on function public.sifremi_degistir(text, text) to authenticated;
