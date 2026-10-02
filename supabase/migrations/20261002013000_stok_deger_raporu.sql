-- 02.10.2026
-- Stok değer raporu (Kasa sayfası). Stoktaki malın TL değeri = mevcut_stok × son fatura fiyatı.
-- Fiyatlar Mikro e-Portal'daki gelen faturalardan gelir; her sabah zamanlanmış görev günceller.
-- Raporu SADECE stok_deger_izinli tablosundaki kullanıcılar görür (Tam Yetkili olmak yetmez).

-- 1) Raporu görebilecek kullanıcılar
create table if not exists public.stok_deger_izinli (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.stok_deger_izinli enable row level security;
-- Politika yok: tabloyu sadece aşağıdaki security definer fonksiyonlar okur.

insert into public.stok_deger_izinli (user_id)
select id from auth.users where lower(email) in ('murat@kebo.com', 'bulent@kebo.com')
on conflict do nothing;

create or replace function public.stok_deger_yetkili()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.stok_deger_izinli where user_id = auth.uid())
$$;

-- 2) Ürün başına son fatura fiyatı
--    birim fiyat (stok biriminde, KDV hariç) = fatura_birim_fiyat × carpan
--    carpan: faturadaki birim stok biriminden farklıysa. Örn. turşu 9 kg'lık kova → 1/9,
--    yağ 18 lt teneke → 1/18, schnitzel faturada kg, stokta adet → 0,1 (1 adet ≈ 100 g).
create table if not exists public.stok_fiyatlar (
  urun_id uuid primary key references public.stok_urunler(id) on delete cascade,
  fatura_kalem_adi text not null,          -- faturadaki ürün adı (otomatik eşleşme bununla yapılır)
  tedarikci_vkn text,                      -- faturayı kesen firmanın VKN'si
  tedarikci text,
  fatura_birim_fiyat numeric not null check (fatura_birim_fiyat >= 0),
  carpan numeric not null default 1 check (carpan > 0),
  kdv_orani numeric not null default 0,
  fatura_no text,
  fatura_tarihi date,
  notlar text,                             -- eşleşme tahmini, birim çevirisi vb. uyarılar
  guncellendi timestamptz not null default now(),
  guncelleyen text
);
alter table public.stok_fiyatlar enable row level security;
drop policy if exists stok_deger_okuma on public.stok_fiyatlar;
create policy stok_deger_okuma on public.stok_fiyatlar for select to authenticated
  using ((select public.stok_deger_yetkili()));
drop policy if exists stok_deger_yazma on public.stok_fiyatlar;
create policy stok_deger_yazma on public.stok_fiyatlar for all to authenticated
  using ((select public.stok_deger_yetkili())) with check ((select public.stok_deger_yetkili()));

-- 3) Rapor: her aktif stok ürünü, güncel sayım miktarı ve değeri.
--    mevcut_stok stok_hareketler trigger'ı ile güncellendiği için rapor sayım girildiği an değişir.
create or replace function public.stok_deger_raporu()
returns table (
  urun_id uuid, urun_adi text, kategori text, birim text, mevcut_stok numeric,
  birim_fiyat numeric, kdv_orani numeric, tutar numeric, tutar_kdvli numeric,
  fatura_kalem_adi text, tedarikci text, fatura_no text, fatura_tarihi date,
  notlar text, stok_guncellendi timestamptz, fiyat_guncellendi timestamptz
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.stok_deger_yetkili() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  return query
  select u.id, u.urun_adi, nullif(trim(u.kategori), ''), u.birim, coalesce(u.mevcut_stok, 0),
         round(f.fatura_birim_fiyat * f.carpan, 4),
         f.kdv_orani,
         round(coalesce(u.mevcut_stok, 0) * f.fatura_birim_fiyat * f.carpan, 2),
         round(coalesce(u.mevcut_stok, 0) * f.fatura_birim_fiyat * f.carpan * (1 + f.kdv_orani / 100), 2),
         f.fatura_kalem_adi, f.tedarikci, f.fatura_no, f.fatura_tarihi, f.notlar,
         u.updated_at, f.guncellendi
    from public.stok_urunler u
    left join public.stok_fiyatlar f on f.urun_id = u.id
   where u.durum = 'aktif'
   order by nullif(trim(u.kategori), '') nulls last, u.sira_no, u.urun_adi;
end $$;

revoke all on function public.stok_deger_raporu() from public, anon;
grant execute on function public.stok_deger_raporu() to authenticated;
revoke all on function public.stok_deger_yetkili() from public, anon;
grant execute on function public.stok_deger_yetkili() to authenticated;
