-- 02.10.2026
-- İskontolu (net) fiyat: Fiyat Listesi ve stok değeri satır iskontosu düşülmüş fiyatla çalışır.
--   net birim fiyat = satır tutarı / miktar (tutar yoksa liste fiyatı)
-- Örn. Kalem Meşrubat kola kolisi liste 1.710,24 ₺, %51 iskonto → net 838,02 ₺ → kutu başı 34,92 ₺.
-- Koli içi adet / kg / lt fiyatları panelde ürün adından hesaplanır (lib/fiyatListesi.ts → paketIcerigi).
-- Not: Saray faturalarında "İskonto" başlığı iki sütunu kapsadığı için ilk aktarımda iskontolu
-- 4 satır kaymıştı (kdv_orani'na iskonto tutarı yazılmıştı); veride elle düzeltildi, okuma kodu colspan'ı sayıyor.

create or replace function public.kalem_net_fiyat(p_tutar numeric, p_miktar numeric, p_birim_fiyat numeric)
returns numeric language sql immutable as $$
  select case when p_tutar is not null and coalesce(p_miktar, 0) <> 0 then round(p_tutar / abs(p_miktar), 4) else p_birim_fiyat end
$$;

create or replace function public.fiyat_listesi_v2()
returns table (urun_adi text, vkn text, tedarikci text, birim text, liste_fiyat numeric, net_fiyat numeric, iskonto numeric,
               son_kdv numeric, son_tarih date, son_fatura text, onceki_net numeric, onceki_tarih date,
               en_dusuk numeric, en_yuksek numeric, alim_sayisi int, toplam_miktar numeric, ilk_tarih date)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query
  with s as (
    select k.*, public.kalem_net_fiyat(k.tutar, k.miktar, k.birim_fiyat) net,
           row_number() over (partition by k.urun_adi, k.vkn order by k.tarih desc, k.gib_no desc, k.sira) rn
      from public.mikro_fatura_kalemleri k where k.birim_fiyat > 0 and coalesce(k.miktar, 1) > 0
  ), ozet as (
    select s.urun_adi, s.vkn, min(s.net) mn, max(s.net) mx, count(distinct s.gib_no)::int n,
           sum(coalesce(s.miktar, 0)) tm, min(s.tarih) ilk
      from s group by s.urun_adi, s.vkn
  ), onceki as (
    select distinct on (s.urun_adi, s.vkn) s.urun_adi, s.vkn, s.net, s.tarih
      from s join s son on son.urun_adi = s.urun_adi and son.vkn is not distinct from s.vkn and son.rn = 1
     where s.tarih < son.tarih
     order by s.urun_adi, s.vkn, s.tarih desc, s.gib_no desc
  )
  select s.urun_adi, s.vkn, s.tedarikci, s.birim, s.birim_fiyat, s.net,
         case when s.birim_fiyat > 0 and s.net < s.birim_fiyat * 0.995 then round((1 - s.net / s.birim_fiyat) * 100, 1) else 0 end,
         s.kdv_orani, s.tarih, s.gib_no, o.net, o.tarih, z.mn, z.mx, z.n, z.tm, z.ilk
    from s join ozet z on z.urun_adi = s.urun_adi and z.vkn is not distinct from s.vkn
    left join onceki o on o.urun_adi = s.urun_adi and o.vkn is not distinct from s.vkn
   where s.rn = 1
   order by s.tarih desc, s.urun_adi;
end $$;
revoke all on function public.fiyat_listesi_v2() from public, anon;
grant execute on function public.fiyat_listesi_v2() to authenticated;

create or replace function public.fiyat_gecmisi_v2(p_urun_adi text, p_vkn text)
returns table (tarih date, gib_no text, miktar numeric, birim text, liste_fiyat numeric, net_fiyat numeric, iskonto numeric,
               kdv_orani numeric, tutar numeric)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query
  select k.tarih, k.gib_no, k.miktar, k.birim, k.birim_fiyat, x.net,
         case when k.birim_fiyat > 0 and x.net < k.birim_fiyat * 0.995 then round((1 - x.net / k.birim_fiyat) * 100, 1) else 0 end,
         k.kdv_orani, k.tutar
    from public.mikro_fatura_kalemleri k
    cross join lateral (select public.kalem_net_fiyat(k.tutar, k.miktar, k.birim_fiyat) net) x
   where k.urun_adi = p_urun_adi and k.vkn is not distinct from p_vkn
   order by k.tarih desc, k.gib_no desc limit 200;
end $$;
revoke all on function public.fiyat_gecmisi_v2(text, text) from public, anon;
grant execute on function public.fiyat_gecmisi_v2(text, text) to authenticated;

-- Stok fiyatları da net fiyatla eşitlenir
create or replace function public._stok_fiyatlari_esitle(p_kim text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare sf record; k record; v_net numeric; v_oran numeric; guncellenen jsonb := '[]'; kontrol jsonb := '[]';
begin
  for sf in select f.*, u.urun_adi as stok_adi from public.stok_fiyatlar f join public.stok_urunler u on u.id = f.urun_id loop
    select * into k from public.mikro_fatura_kalemleri m
     where m.vkn = sf.tedarikci_vkn and m.urun_adi = regexp_replace(trim(sf.fatura_kalem_adi), '\s+', ' ', 'g')
       and coalesce(m.miktar, 1) > 0
     order by m.tarih desc, m.gib_no desc limit 1;
    if not found then continue; end if;
    v_net := public.kalem_net_fiyat(k.tutar, k.miktar, k.birim_fiyat);
    if k.tarih < coalesce(sf.fatura_tarihi, date '1900-01-01') then continue; end if;
    if k.tarih = sf.fatura_tarihi and abs(v_net - sf.fatura_birim_fiyat) < 0.00005 then
      if sf.fatura_no is null then update public.stok_fiyatlar set fatura_no = k.gib_no where urun_id = sf.urun_id; end if;
      continue;
    end if;
    v_oran := case when sf.fatura_birim_fiyat > 0 then abs(v_net - sf.fatura_birim_fiyat) / sf.fatura_birim_fiyat else 1 end;
    if v_oran > 0.3 then
      kontrol := kontrol || jsonb_build_object('urun_id', sf.urun_id, 'urun', sf.stok_adi, 'eski', sf.fatura_birim_fiyat,
        'yeni', v_net, 'oran', round(v_oran * 100), 'fatura', k.gib_no, 'tarih', k.tarih);
      continue;
    end if;
    update public.stok_fiyatlar set fatura_birim_fiyat = v_net, kdv_orani = k.kdv_orani, fatura_no = k.gib_no,
      fatura_tarihi = k.tarih, guncellendi = now(), guncelleyen = p_kim where urun_id = sf.urun_id;
    if abs(v_net - sf.fatura_birim_fiyat) >= 0.00005 then
      guncellenen := guncellenen || jsonb_build_object('urun', sf.stok_adi, 'eski', sf.fatura_birim_fiyat, 'yeni', v_net, 'fatura', k.gib_no);
    end if;
  end loop;
  return jsonb_build_object('guncellenen', guncellenen, 'kontrol', kontrol);
end $$;
revoke all on function public._stok_fiyatlari_esitle(text) from public, anon, authenticated;

create or replace function public.stok_fiyat_kontrol_onayla(p_urun_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sf public.stok_fiyatlar; k record;
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select * into sf from public.stok_fiyatlar where urun_id = p_urun_id;
  if not found then raise exception 'Ürünün fiyat eşleşmesi yok.'; end if;
  select * into k from public.mikro_fatura_kalemleri m
   where m.vkn = sf.tedarikci_vkn and m.urun_adi = regexp_replace(trim(sf.fatura_kalem_adi), '\s+', ' ', 'g')
     and coalesce(m.miktar, 1) > 0
   order by m.tarih desc, m.gib_no desc limit 1;
  if not found then raise exception 'Bu ürün için aktarılmış fatura yok.'; end if;
  update public.stok_fiyatlar set fatura_birim_fiyat = public.kalem_net_fiyat(k.tutar, k.miktar, k.birim_fiyat),
    kdv_orani = k.kdv_orani, fatura_no = k.gib_no, fatura_tarihi = k.tarih, guncellendi = now(),
    guncelleyen = coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel') || ' (elle onay)'
   where urun_id = p_urun_id;
end $$;
revoke all on function public.stok_fiyat_kontrol_onayla(uuid) from public, anon;
grant execute on function public.stok_fiyat_kontrol_onayla(uuid) to authenticated;
