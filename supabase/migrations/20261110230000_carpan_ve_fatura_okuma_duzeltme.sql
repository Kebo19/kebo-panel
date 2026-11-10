-- 10.11.2026 — Çarpan karışıklığı ve fatura okuma hatası düzeltmesi
--
-- İki tablo "carpan"ı TERS anlamda kullanıyor:
--   stok_kalem_eslesme / stok_giris_onerileri.carpan = MİKTAR çarpanı: 1 fatura birimi kaç stok birimi
--       (yağ: 1 teneke = 18 lt → 18; ketçap kutusu = 504 adet → 504)
--   stok_fiyatlar.carpan = FİYAT çarpanı: stok birim fiyatı = fatura birim fiyatı × carpan
--       (yağ: 1/18; ketçap: 1/504)
-- Faturadan stok girişi onaylanırken (_stok_giris_karar) ve irsaliyeye bağlarken (_irsaliye_bagla)
-- stok_fiyatlar'a miktar çarpanı olduğu gibi yazılıyordu → Kingtom ketçap/mayonez adet fiyatı 425 × 504 = 214.200 ₺
-- görünüyordu (stok değeri ve reçete maliyeti milyonlarca TL şişiyordu). Ters yönde de: 25.10'daki ilk
-- doldurma stok_fiyatlar'daki fiyat çarpanını eşleşmeye kopyalamıştı → Schnitzel (kg→adet) 0,1 ve
-- turşu (kova→kg) 1/9 miktar çarpanı aldı; 10 kova turşu stoğa 1,1 kg girecekti.
-- Ayrıca Saray 05.10 SDF2026000016816 yağ satırı okunurken kaymıştı (KDV oranına iskonto tutarı 2.160,
-- tutara KDV tutarı 248,4 yazılmış) → net fiyat 24,84 ₺/teneke = 1,38 ₺/lt. Fiyat eşitleme %30'dan büyük
-- değişimi "kontrol" listesine attığı için sonraki doğru faturalar (02.11, 2.450 ₺) hiç işlenmemişti.

-- 1) Fonksiyonlar: stok_fiyatlar'a fiyat çarpanı (1 / miktar çarpanı) yazılır; aynı fatura kalemine bağlı
--    mevcut satır varsa çarpan ve (daha yeni ise) fiyat güncellenir.
create or replace function public._stok_giris_karar(p_kararlar jsonb, p_kim text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare k jsonb; o public.stok_giris_onerileri%rowtype; v_urun uuid; v_carpan numeric; v_miktar numeric; v_hareket uuid;
        n_onay int := 0; n_red int := 0; n_eksik int := 0; v_karar text;
begin
  for k in select * from jsonb_array_elements(coalesce(p_kararlar, '[]'::jsonb)) loop
    select * into o from public.stok_giris_onerileri where id = (k ->> 'id')::uuid and durum = 'bekliyor' for update;
    if not found then continue; end if;
    v_karar := k ->> 'karar';
    v_urun := coalesce(nullif(k ->> 'urun_id', '')::uuid, o.urun_id);
    v_carpan := coalesce(nullif(k ->> 'carpan', '')::numeric, o.carpan, 1);
    if v_carpan <= 0 then v_carpan := 1; end if;

    if v_karar = 'takip_etme' then
      insert into public.stok_kalem_eslesme (vkn, kalem_adi, urun_id, carpan, yoksay, guncelleyen)
      values (o.vkn, o.kalem_adi, null, 1, true, p_kim)
      on conflict (vkn, kalem_adi) do update set yoksay = true, urun_id = null, guncelleyen = p_kim, guncellendi = now();
      update public.stok_giris_onerileri set durum = 'reddedildi', karar_veren = p_kim, karar_zamani = now() where id = o.id;
      n_red := n_red + 1; continue;
    end if;
    if v_karar = 'reddet' then
      update public.stok_giris_onerileri set durum = 'reddedildi', karar_veren = p_kim, karar_zamani = now() where id = o.id;
      n_red := n_red + 1; continue;
    end if;
    if v_karar <> 'onayla' then continue; end if;
    if v_urun is null or coalesce(o.fatura_miktar, 0) <= 0 then n_eksik := n_eksik + 1; continue; end if;

    v_miktar := round(o.fatura_miktar * v_carpan, 3);
    insert into public.stok_hareketler (urun_id, tarih, tip, neden, miktar, birim_fiyat, kaynak, kullanici, aciklama)
    values (v_urun, o.tarih, case when o.iade then 'cikis' else 'giris' end, case when o.iade then 'iade' end, v_miktar,
            case when o.fatura_birim_fiyat is not null then round(o.fatura_birim_fiyat / v_carpan, 4) end,
            'fatura', p_kim,
            left(format('Fatura %s · %s · %s %s %s', o.gib_no, coalesce(o.tedarikci, ''), o.fatura_miktar, coalesce(o.fatura_birim, ''), o.kalem_adi), 300))
    returning id into v_hareket;
    update public.stok_giris_onerileri set durum = 'onaylandi', urun_id = v_urun, carpan = v_carpan, hareket_id = v_hareket,
           karar_veren = p_kim, karar_zamani = now() where id = o.id;

    if coalesce((k ->> 'hatirla')::boolean, false) or o.urun_id is null or o.urun_id <> v_urun or o.carpan <> v_carpan then
      insert into public.stok_kalem_eslesme (vkn, kalem_adi, urun_id, carpan, yoksay, guncelleyen)
      values (o.vkn, o.kalem_adi, v_urun, v_carpan, false, p_kim)
      on conflict (vkn, kalem_adi) do update set urun_id = excluded.urun_id, carpan = excluded.carpan, yoksay = false,
                                                 guncelleyen = p_kim, guncellendi = now();
      -- Aynı kalemin bekleyen diğer önerileri de bu eşleşmeyi alsın
      update public.stok_giris_onerileri set urun_id = v_urun, carpan = v_carpan
       where durum = 'bekliyor' and vkn = o.vkn and kalem_adi = o.kalem_adi and urun_id is null;
      -- Ürünün fiyat takibi yoksa bu kalemle başlat (Fiyat Listesi / stok değeri)
      insert into public.stok_fiyatlar (urun_id, fatura_kalem_adi, tedarikci_vkn, tedarikci, fatura_birim_fiyat, carpan, fatura_no, fatura_tarihi, guncellendi, guncelleyen)
      values (v_urun, o.kalem_adi, o.vkn, o.tedarikci, coalesce(o.fatura_birim_fiyat, 0), 1 / v_carpan, o.gib_no, o.tarih, now(), p_kim)
      on conflict (urun_id) do update set carpan = excluded.carpan, guncellendi = now(), guncelleyen = excluded.guncelleyen,
        fatura_birim_fiyat = case when excluded.fatura_tarihi >= coalesce(stok_fiyatlar.fatura_tarihi, date '1900-01-01') and excluded.fatura_birim_fiyat > 0
                                  then excluded.fatura_birim_fiyat else stok_fiyatlar.fatura_birim_fiyat end,
        fatura_no = case when excluded.fatura_tarihi >= coalesce(stok_fiyatlar.fatura_tarihi, date '1900-01-01') then excluded.fatura_no else stok_fiyatlar.fatura_no end,
        fatura_tarihi = greatest(excluded.fatura_tarihi, stok_fiyatlar.fatura_tarihi)
       where stok_fiyatlar.tedarikci_vkn is not distinct from excluded.tedarikci_vkn
         and regexp_replace(trim(stok_fiyatlar.fatura_kalem_adi), '\s+', ' ', 'g') = excluded.fatura_kalem_adi;
    end if;
    if not o.iade and o.fatura_birim_fiyat is not null then
      update public.stok_urunler set son_fiyat = round(o.fatura_birim_fiyat / v_carpan, 4) where id = v_urun;
    end if;
    n_onay := n_onay + 1;
  end loop;
  return jsonb_build_object('onaylanan', n_onay, 'reddedilen', n_red, 'urunu_eksik', n_eksik);
end $$;

create or replace function public._irsaliye_bagla(p_baglar jsonb, p_kim text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb; o public.stok_giris_onerileri%rowtype; k public.stok_fatura_kalemleri%rowtype;
        v_carpan numeric; v_stok numeric; v_fark numeric; v_hareket uuid; n int := 0; n_duz int := 0;
begin
  for b in select * from jsonb_array_elements(coalesce(p_baglar, '[]'::jsonb)) loop
    select * into o from public.stok_giris_onerileri where id = (b ->> 'oneri_id')::uuid and durum = 'bekliyor' for update;
    if not found then continue; end if;
    select * into k from public.stok_fatura_kalemleri where id = (b ->> 'irsaliye_kalem_id')::uuid and fatura_gib is null for update;
    if not found or k.urun_id is null then continue; end if;

    v_carpan := o.carpan;
    if o.urun_id is null or o.urun_id <> k.urun_id then
      -- Eşleşme irsaliyeden öğrenilir: 1 fatura birimi = irsaliye miktarı / fatura miktarı stok birimi
      v_carpan := case when coalesce(o.fatura_miktar, 0) > 0 and coalesce(k.teslim_miktar, k.miktar, 0) > 0
                       then round(coalesce(k.teslim_miktar, k.miktar) / o.fatura_miktar, 4) else 1 end;
      insert into public.stok_kalem_eslesme (vkn, kalem_adi, urun_id, carpan, yoksay, guncelleyen)
      values (o.vkn, o.kalem_adi, k.urun_id, v_carpan, false, p_kim)
      on conflict (vkn, kalem_adi) do update set urun_id = excluded.urun_id, carpan = excluded.carpan, yoksay = false, guncelleyen = p_kim, guncellendi = now();
      insert into public.stok_fiyatlar (urun_id, fatura_kalem_adi, tedarikci_vkn, tedarikci, fatura_birim_fiyat, carpan, fatura_no, fatura_tarihi, guncellendi, guncelleyen)
      values (k.urun_id, o.kalem_adi, o.vkn, o.tedarikci, coalesce(o.fatura_birim_fiyat, 0), 1 / v_carpan, o.gib_no, o.tarih, now(), p_kim)
      on conflict (urun_id) do update set carpan = excluded.carpan, guncellendi = now(), guncelleyen = excluded.guncelleyen,
        fatura_birim_fiyat = case when excluded.fatura_tarihi >= coalesce(stok_fiyatlar.fatura_tarihi, date '1900-01-01') and excluded.fatura_birim_fiyat > 0
                                  then excluded.fatura_birim_fiyat else stok_fiyatlar.fatura_birim_fiyat end,
        fatura_no = case when excluded.fatura_tarihi >= coalesce(stok_fiyatlar.fatura_tarihi, date '1900-01-01') then excluded.fatura_no else stok_fiyatlar.fatura_no end,
        fatura_tarihi = greatest(excluded.fatura_tarihi, stok_fiyatlar.fatura_tarihi)
       where stok_fiyatlar.tedarikci_vkn is not distinct from excluded.tedarikci_vkn
         and regexp_replace(trim(stok_fiyatlar.fatura_kalem_adi), '\s+', ' ', 'g') = excluded.fatura_kalem_adi;
    end if;
    v_stok := round(coalesce(o.fatura_miktar, 0) * v_carpan, 3);

    if k.durum = 'teslim' then
      v_hareket := k.hareket_id;
      v_fark := round(v_stok - coalesce(k.teslim_miktar, k.miktar, 0), 3);
      if coalesce((b ->> 'fark_isle')::boolean, false) and abs(v_fark) >= 0.001 then
        insert into public.stok_hareketler (urun_id, tarih, tip, miktar, kaynak, kullanici, aciklama)
        values (k.urun_id, o.tarih, 'duzeltme', v_fark, 'fatura', p_kim,
                left(format('Fatura farkı: %s (irsaliye %s, fatura %s)', o.gib_no, coalesce(k.teslim_miktar, k.miktar), v_stok), 300));
        n_duz := n_duz + 1;
      end if;
    else
      insert into public.stok_hareketler (urun_id, tarih, tip, miktar, birim_fiyat, kaynak, kullanici, aciklama)
      values (k.urun_id, o.tarih, 'giris', v_stok,
              case when o.fatura_birim_fiyat is not null then round(o.fatura_birim_fiyat / v_carpan, 4) end, 'fatura', p_kim,
              left(format('Fatura %s · %s (irsaliye teslim alınmamıştı)', o.gib_no, coalesce(o.tedarikci, '')), 300))
      returning id into v_hareket;
      update public.stok_fatura_kalemleri set durum = 'teslim', teslim_miktar = v_stok, teslim_tarihi = o.tarih, hareket_id = v_hareket where id = k.id;
    end if;

    update public.stok_fatura_kalemleri set fatura_gib = o.gib_no where id = k.id;
    update public.stok_giris_onerileri set durum = 'onaylandi', urun_id = k.urun_id, carpan = v_carpan, hareket_id = v_hareket,
           irsaliye_kalem_id = k.id, karar_veren = p_kim, karar_zamani = now() where id = o.id;
    if o.fatura_birim_fiyat is not null and not o.iade then
      update public.stok_urunler set son_fiyat = round(o.fatura_birim_fiyat / v_carpan, 4) where id = k.urun_id;
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('baglanan', n, 'duzeltme', n_duz);
end $$;

-- 2) Okuma sağlaması: KDV oranı geçersizse (0/1/8/10/18/20 dışı) satır kaymış demektir →
--    tutar miktar × fiyat × (1 − iskonto) ile yeniden hesaplanır, KDV oranı aynı ürünün son geçerli oranından alınır.
create or replace function public._mikro_kalem_dogrula()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_kdv numeric;
begin
  if new.kdv_orani not in (0, 1, 8, 10, 18, 20) then
    select k.kdv_orani into v_kdv from public.mikro_fatura_kalemleri k
     where k.urun_adi = new.urun_adi and k.vkn is not distinct from new.vkn and k.kdv_orani in (0, 1, 8, 10, 18, 20)
     order by k.tarih desc limit 1;
    new.kdv_orani := coalesce(v_kdv, 0);
    if new.miktar is not null and new.birim_fiyat > 0 then
      new.tutar := round(abs(new.miktar) * new.birim_fiyat * (1 - coalesce(new.iskonto_orani, 0) / 100), 2) * sign(new.miktar);
    end if;
  end if;
  return new;
end $$;
revoke all on function public._mikro_kalem_dogrula() from public, anon, authenticated;
drop trigger if exists trg_mikro_kalem_dogrula on public.mikro_fatura_kalemleri;
create trigger trg_mikro_kalem_dogrula before insert or update on public.mikro_fatura_kalemleri
  for each row execute function public._mikro_kalem_dogrula();

-- 3) Veri düzeltmeleri
-- 3a) Saray 05.10 yağ satırı (eski: kdv 2160, tutar 248,4) → kdv 1, tutar 10 × 2.700 × %92 = 24.840
update public.mikro_fatura_kalemleri set kdv_orani = 1, tutar = 24840
 where gib_no = 'SDF2026000016816' and urun_adi = 'USTAM KIZARTMA YAĞI 18 LT' and kdv_orani = 2160;
update public.stok_giris_onerileri set fatura_birim_fiyat = 2484
 where gib_no = 'SDF2026000016816' and kalem_adi = 'USTAM KIZARTMA YAĞI 18 LT';
-- 05.10 stok girişinin birim fiyatı 1,38 → 138 ₺/lt
update public.stok_hareketler set birim_fiyat = 138
 where kaynak = 'fatura' and birim_fiyat = 1.38 and aciklama like 'Fatura SDF2026000016816%KIZARTMA YAĞI%';

-- 3b) Yağ fiyatı: son fatura 02.11 SDF2026000018676, 2.450 ₺/teneke (eski 24,84 / 05.10)
update public.stok_fiyatlar f set fatura_birim_fiyat = 2450, kdv_orani = 1, fatura_no = 'SDF2026000018676', fatura_tarihi = date '2026-11-02',
       guncellendi = now(), guncelleyen = 'claude (10.11 düzeltme)'
  from public.stok_urunler u
 where u.id = f.urun_id and f.fatura_kalem_adi = 'USTAM KIZARTMA YAĞI 18 LT' and f.fatura_birim_fiyat = 24.84;

-- 3c) Ters yazılmış fiyat çarpanları: Kingtom ketçap/mayonez 504 → 1/504
update public.stok_fiyatlar set carpan = 1.0 / 504, guncellendi = now(), guncelleyen = 'claude (10.11 düzeltme)'
 where carpan = 504 and fatura_kalem_adi in ('KİNGTOM STİK KETÇAP 10 GR * 504', 'KİNGTOM STİK MAYONEZ 10 GR * 504');

-- 3d) Ters kopyalanmış miktar çarpanları: Schnitzel 1 kg = 10 adet (0,1 → 10), turşu 1 kova = 9 kg (1/9 → 9)
update public.stok_kalem_eslesme set carpan = 10, guncellendi = now(), guncelleyen = 'claude (10.11 düzeltme)'
 where kalem_adi = 'SCHNITZEL' and carpan = 0.1;
update public.stok_kalem_eslesme set carpan = 9, guncellendi = now(), guncelleyen = 'claude (10.11 düzeltme)'
 where kalem_adi = 'SALATALIK 3 NO 9 KG KOVA' and carpan < 1;
update public.stok_giris_onerileri set carpan = 10 where durum = 'bekliyor' and kalem_adi = 'SCHNITZEL' and carpan = 0.1;
update public.stok_giris_onerileri set carpan = 9 where durum = 'bekliyor' and kalem_adi = 'SALATALIK 3 NO 9 KG KOVA' and carpan < 1;
