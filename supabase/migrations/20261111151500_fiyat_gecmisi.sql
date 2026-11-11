-- 11.11.2026 — Fiyat uyarısındaki ürüne tıklayınca geçmiş bütün alış fiyatları
-- Ürünün bağlı olduğu bütün fatura kalemleri (stok_kalem_eslesme + stok_fiyatlar; birden fazla firma/kalem adı olabilir)
-- Mikro fatura satırlarından listelenir. Stok birimi fiyatı: eşleşmede miktar çarpanı varsa net / çarpan,
-- yoksa net × stok_fiyatlar fiyat çarpanı. Murat, Bülent, Bekir (kebo_kullanici) görebilir.

create or replace function public.fiyat_gecmisi(p_urun_id uuid)
returns table (tarih date, gib_no text, tedarikci text, kalem_adi text, miktar numeric, birim text,
               fatura_birim_fiyat numeric, iskonto_orani numeric, net_fiyat numeric, stok_birim_fiyat numeric)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query
  with kalemler as (
    select e.vkn, e.kalem_adi, e.carpan miktar_carpan, null::numeric fiyat_carpan
      from public.stok_kalem_eslesme e where e.urun_id = p_urun_id and not e.yoksay
    union
    select f.tedarikci_vkn, regexp_replace(trim(f.fatura_kalem_adi), '\s+', ' ', 'g'), null, f.carpan
      from public.stok_fiyatlar f where f.urun_id = p_urun_id
       and not exists (select 1 from public.stok_kalem_eslesme e where e.urun_id = p_urun_id and not e.yoksay
                        and e.vkn = f.tedarikci_vkn and e.kalem_adi = regexp_replace(trim(f.fatura_kalem_adi), '\s+', ' ', 'g'))
  )
  select m.tarih, m.gib_no, m.tedarikci, m.urun_adi, m.miktar, m.birim, m.birim_fiyat, m.iskonto_orani,
         public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat),
         round(case when k.miktar_carpan > 0 then public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat) / k.miktar_carpan
                    else public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat) * coalesce(k.fiyat_carpan, 1) end, 4)
    from kalemler k
    join public.mikro_fatura_kalemleri m on m.vkn = k.vkn and m.urun_adi = k.kalem_adi
   where coalesce(m.miktar, 1) > 0 and m.birim_fiyat > 0
   order by m.tarih desc, m.gib_no desc;
end $$;
revoke all on function public.fiyat_gecmisi(uuid) from public, anon;
grant execute on function public.fiyat_gecmisi(uuid) to authenticated;
