-- 10.11.2026 — Yüksek fiyat değişimi uyarısı (her sayfanın üstünde, büyük harflerle; Murat, Bülent, Bekir)
-- Stokta fiyatı takip edilen bir ürünün (stok_fiyatlar) en son faturadaki net fiyatı kayıtlı fiyattan %30'dan
-- fazla farklıysa fiyat kendiliğinden güncellenmez (_stok_fiyatlari_esitle → "kontrol"). Böyle her değişim
-- fiyat_uyarilari_kayit'a bir kez yazılır ve HER KULLANICIYA AYRI AYRI gösterilir: biri "Gördüm" deyince
-- sadece onun ekranından kalkar, diğerleri girdiklerinde yine görür (fiyat_uyari_gorulen).
-- Fiyat kararı ayrıdır: "Yeni fiyatı kabul et" (stok_fiyat_kontrol_onayla) ya da "Eski fiyat kalsın";
-- karar uyarıyı kimseden silmez, uyarıda "X kabul etti" yazar.

create table if not exists public.fiyat_uyarilari_kayit (
  id uuid primary key default gen_random_uuid(),
  urun_id uuid not null references public.stok_urunler(id) on delete cascade,
  gib_no text not null,
  tedarikci text,
  eski_fiyat numeric, yeni_fiyat numeric, oran numeric,
  eski_tarih date, yeni_tarih date,
  karar text check (karar in ('kabul', 'eski')),
  karar_veren text, karar_zamani timestamptz,
  olusma timestamptz not null default now(),
  unique (urun_id, gib_no)
);
create table if not exists public.fiyat_uyari_gorulen (
  uyari_id uuid not null references public.fiyat_uyarilari_kayit(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  zaman timestamptz not null default now(),
  primary key (uyari_id, user_id)
);
alter table public.fiyat_uyarilari_kayit enable row level security;
alter table public.fiyat_uyari_gorulen enable row level security;
-- Politika yok: sadece aşağıdaki security definer fonksiyonlar kullanır.

-- (ilk sürümden kalan; kullanılmıyor)
drop function if exists public.fiyat_uyarisi_karar(uuid, text, text);
drop table if exists public.fiyat_uyari_kapatilan;
drop function if exists public.fiyat_uyarilari();

-- Bekleyen büyük değişimleri kayda geçirir (aynı ürün + fatura bir kez).
create or replace function public._fiyat_uyarilarini_tara()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.fiyat_uyarilari_kayit (urun_id, gib_no, tedarikci, eski_fiyat, yeni_fiyat, oran, eski_tarih, yeni_tarih)
  select u.id, k.gib_no, f.tedarikci,
         round(f.fatura_birim_fiyat * f.carpan, 4), round(k.net * f.carpan, 4),
         round((k.net - f.fatura_birim_fiyat) / f.fatura_birim_fiyat * 100, 1), f.fatura_tarihi, k.tarih
    from public.stok_fiyatlar f
    join public.stok_urunler u on u.id = f.urun_id and u.durum = 'aktif'
    cross join lateral (
      select public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat) net, m.tarih, m.gib_no
        from public.mikro_fatura_kalemleri m
       where m.vkn = f.tedarikci_vkn and m.urun_adi = regexp_replace(trim(f.fatura_kalem_adi), '\s+', ' ', 'g')
         and coalesce(m.miktar, 1) > 0
       order by m.tarih desc, m.gib_no desc limit 1) k
   where f.fatura_birim_fiyat > 0
     and k.tarih >= coalesce(f.fatura_tarihi, date '1900-01-01')
     and k.gib_no is distinct from f.fatura_no
     and abs(k.net - f.fatura_birim_fiyat) / f.fatura_birim_fiyat > 0.3
  on conflict (urun_id, gib_no) do nothing;
end $$;
revoke all on function public._fiyat_uyarilarini_tara() from public, anon, authenticated;

-- Giriş yapan kullanıcının henüz "Gördüm" demediği uyarılar
create or replace function public.fiyat_uyarilari()
returns table (id uuid, urun_id uuid, urun_adi text, birim text, tedarikci text, eski_fiyat numeric, yeni_fiyat numeric,
               oran numeric, eski_tarih date, yeni_tarih date, gib_no text, karar text, karar_veren text)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  perform public._fiyat_uyarilarini_tara();
  return query
  select r.id, r.urun_id, u.urun_adi, u.birim, r.tedarikci, r.eski_fiyat, r.yeni_fiyat, r.oran, r.eski_tarih, r.yeni_tarih,
         r.gib_no, r.karar, r.karar_veren
    from public.fiyat_uyarilari_kayit r join public.stok_urunler u on u.id = r.urun_id
   where not exists (select 1 from public.fiyat_uyari_gorulen g where g.uyari_id = r.id and g.user_id = auth.uid())
   order by r.olusma desc, abs(r.oran) desc;
end $$;
revoke all on function public.fiyat_uyarilari() from public, anon;
grant execute on function public.fiyat_uyarilari() to authenticated;

-- "Gördüm": sadece bu kullanıcının ekranından kalkar
create or replace function public.fiyat_uyarisi_gordum(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  insert into public.fiyat_uyari_gorulen (uyari_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.fiyat_uyarisi_gordum(uuid) from public, anon;
grant execute on function public.fiyat_uyarisi_gordum(uuid) to authenticated;

-- Fiyat kararı: 'kabul' → yeni fiyat stok fiyatı olur; 'eski' → eski fiyat kalır. Uyarı kimseden silinmez.
create or replace function public.fiyat_uyarisi_karar(p_id uuid, p_karar text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r public.fiyat_uyarilari_kayit; v_kim text := coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel');
begin
  if not public.stok_deger_yetkili() then raise exception 'Fiyat kararı için stok değeri yetkisi gerekir.' using errcode = '42501'; end if;
  if p_karar not in ('kabul', 'eski') then raise exception 'Geçersiz karar: %', p_karar; end if;
  select * into r from public.fiyat_uyarilari_kayit where id = p_id for update;
  if not found then raise exception 'Uyarı bulunamadı.'; end if;
  if r.karar is not null then raise exception 'Bu fiyat için % zaten karar verdi.', r.karar_veren; end if;
  if p_karar = 'kabul' then perform public.stok_fiyat_kontrol_onayla(r.urun_id); end if;
  update public.fiyat_uyarilari_kayit set karar = p_karar, karar_veren = v_kim, karar_zamani = now() where id = p_id;
end $$;
revoke all on function public.fiyat_uyarisi_karar(uuid, text) from public, anon;
grant execute on function public.fiyat_uyarisi_karar(uuid, text) to authenticated;
