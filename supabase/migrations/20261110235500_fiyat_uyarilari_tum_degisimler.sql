-- 10.11.2026 23:55 — Fiyat uyarısı TÜM değişimlerde (kullanıcı: "güncel fiyatlara hepimiz vakıf olalım")
-- Karşılaştırma artık BİR ÖNCEKİ FATURADAKİ fiyatla yapılır (stok fiyatı eski kalmış olabilir: domates
-- stokta 50 ₺ (03.10) görünüyordu ama bir önceki fatura 90 ₺, son fatura 80 ₺ → aslında %11 indirim).
-- Kapsam: stokta fiyatı takip edilen ürünler (stok_fiyatlar), 01.11.2026'dan itibaren gelen faturalar, %0,5'ten büyük
-- her değişim. Trendyol komisyon vb. stok dışı kalemler girmez.
-- "Karar gerekli": son fatura fiyatı kayıtlı stok fiyatından %30'dan fazla farklıysa fiyat kendiliğinden güncellenmez;
-- o satırda "Yeni fiyatı kabul et / Eski fiyat kalsın" düğmeleri çıkar. Küçük değişimler zaten kendiliğinden işlenir.
-- Kişi başına "Gördüm" aynı (fiyat_uyari_gorulen).

delete from public.fiyat_uyarilari_kayit;   -- ilk sürümün (stok fiyatıyla kıyas) tek kaydı; henüz kimse görmedi

create or replace function public._fiyat_uyarilarini_tara()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.fiyat_uyarilari_kayit (urun_id, gib_no, tedarikci, eski_fiyat, yeni_fiyat, oran, eski_tarih, yeni_tarih)
  select x.urun_id, x.gib_no, x.tedarikci, round(x.onceki * x.carpan, 4), round(x.net * x.carpan, 4),
         round((x.net - x.onceki) / x.onceki * 100, 1), x.onceki_tarih, x.tarih
    from (
      select f.urun_id, f.carpan, m.gib_no, m.tedarikci, m.tarih,
             public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat) net,
             lag(public.kalem_net_fiyat(m.tutar, m.miktar, m.birim_fiyat)) over w onceki,
             lag(m.tarih) over w onceki_tarih
        from public.stok_fiyatlar f
        join public.stok_urunler u on u.id = f.urun_id and u.durum = 'aktif'
        join public.mikro_fatura_kalemleri m
          on m.vkn = f.tedarikci_vkn and m.urun_adi = regexp_replace(trim(f.fatura_kalem_adi), '\s+', ' ', 'g')
         and coalesce(m.miktar, 1) > 0 and m.birim_fiyat > 0
      window w as (partition by f.urun_id order by m.tarih, m.gib_no, m.sira)
    ) x
   where x.tarih >= date '2026-11-01' and x.onceki > 0 and abs(x.net - x.onceki) / x.onceki > 0.005
  on conflict (urun_id, gib_no) do nothing;
end $$;
revoke all on function public._fiyat_uyarilarini_tara() from public, anon, authenticated;

drop function if exists public.fiyat_uyarilari();
create or replace function public.fiyat_uyarilari()
returns table (id uuid, urun_id uuid, urun_adi text, birim text, tedarikci text, eski_fiyat numeric, yeni_fiyat numeric,
               oran numeric, eski_tarih date, yeni_tarih date, gib_no text, karar text, karar_veren text,
               karar_gerekli boolean, stok_fiyati numeric)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  perform public._fiyat_uyarilarini_tara();
  return query
  select r.id, r.urun_id, u.urun_adi, u.birim, r.tedarikci, r.eski_fiyat, r.yeni_fiyat, r.oran, r.eski_tarih, r.yeni_tarih,
         r.gib_no, r.karar, r.karar_veren,
         -- bu fatura stok fiyatına işlenmemiş ve kayıtlı fiyattan %30'dan fazla farklı → karar bekliyor
         (r.karar is null and f.fatura_no is distinct from r.gib_no and f.fatura_birim_fiyat > 0
          and abs(r.yeni_fiyat - f.fatura_birim_fiyat * f.carpan) / (f.fatura_birim_fiyat * f.carpan) > 0.3
          and r.yeni_tarih >= coalesce(f.fatura_tarihi, date '1900-01-01')),
         round(f.fatura_birim_fiyat * f.carpan, 4)
    from public.fiyat_uyarilari_kayit r
    join public.stok_urunler u on u.id = r.urun_id
    left join public.stok_fiyatlar f on f.urun_id = r.urun_id
   where not exists (select 1 from public.fiyat_uyari_gorulen g where g.uyari_id = r.id and g.user_id = auth.uid())
   order by r.yeni_tarih desc, abs(r.oran) desc;
end $$;
revoke all on function public.fiyat_uyarilari() from public, anon;
grant execute on function public.fiyat_uyarilari() to authenticated;
