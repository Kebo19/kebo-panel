-- Stokla ilgisi olmayan tedarikçiler (Trendyol komisyon faturası, elektrik, İSG…): faturaları stok girişi için sorulmaz (31.10.2026).
create table if not exists public.stok_takipsiz_tedarikci (
  vkn text primary key,
  tedarikci text,
  ekleyen text,
  eklendi timestamptz not null default now()
);
alter table public.stok_takipsiz_tedarikci enable row level security;
drop policy if exists stok_takipsiz_tedarikci_oku on public.stok_takipsiz_tedarikci;
create policy stok_takipsiz_tedarikci_oku on public.stok_takipsiz_tedarikci for select to authenticated using ((select public.kebo_izin('stok')));

create or replace function public._stok_giris_onerisi_olustur()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare e public.stok_kalem_eslesme%rowtype; v_iade boolean;
begin
  if exists (select 1 from public.stok_takipsiz_tedarikci t where t.vkn = new.vkn) then return null; end if;
  select * into e from public.stok_kalem_eslesme where vkn = new.vkn and kalem_adi = new.urun_adi;
  if found and e.yoksay then return null; end if;
  select coalesce(tip, '') = 'IADE' into v_iade from public.mikro_faturalar where gib_no = new.gib_no;
  insert into public.stok_giris_onerileri (kalem_id, gib_no, sira, tarih, tedarikci, vkn, iade, kalem_adi, fatura_miktar, fatura_birim,
                                           fatura_birim_fiyat, urun_id, carpan)
  values (new.id, new.gib_no, new.sira, new.tarih, new.tedarikci, new.vkn, coalesce(v_iade, false), new.urun_adi, new.miktar, new.birim,
          public.kalem_net_fiyat(new.tutar, new.miktar, new.birim_fiyat), e.urun_id, coalesce(e.carpan, 1))
  on conflict (kalem_id) do nothing;
  return null;
end $function$;

-- p_takip=false: tedarikçi stokla ilgisiz; bekleyen bütün kalemleri reddedilir, yenileri gelmez. true: geri al.
create or replace function public.stok_tedarikci_takip(p_vkn text, p_takip boolean, p_tedarikci text default null)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_kim text := coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel'); n int := 0;
begin
  if not public.kebo_izin('stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  if coalesce(trim(p_vkn), '') = '' then raise exception 'Vergi numarası yok.'; end if;
  if p_takip then
    delete from public.stok_takipsiz_tedarikci where vkn = p_vkn;
    return 0;
  end if;
  insert into public.stok_takipsiz_tedarikci (vkn, tedarikci, ekleyen) values (p_vkn, p_tedarikci, v_kim)
  on conflict (vkn) do update set tedarikci = coalesce(excluded.tedarikci, stok_takipsiz_tedarikci.tedarikci), ekleyen = v_kim, eklendi = now();
  update public.stok_giris_onerileri set durum = 'reddedildi', karar_veren = v_kim, karar_zamani = now()
   where vkn = p_vkn and durum = 'bekliyor';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public.stok_tedarikci_takip(text, boolean, text) from public, anon;
grant execute on function public.stok_tedarikci_takip(text, boolean, text) to authenticated;
