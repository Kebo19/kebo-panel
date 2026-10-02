-- 02.10.2026
-- Fiyat listesi: Mikro e-Portal'daki gelen faturaların TÜM kalemleri (domates, kola, eldiven...)
-- panelde aranabilir. Aktarım tarayıcıdan yapılır: /fiyatlar sayfasındaki "Mikro'dan güncelle"
-- butonu Mikro'yu açar, "Kebo'ya aktar" yer imi (public/kebo-aktar.js) faturaları okuyup
-- panele gönderir, panel mikro_faturalari_kaydet() ile yazar. (Mikro sunucudan gelen
-- istekleri Cloudflare ile engellediği için sunucu botu çalışmıyor.)
-- Görme/yazma yetkisi stok değeri raporuyla aynı: stok_deger_izinli (Murat, Bülent).

create table if not exists public.mikro_faturalar (
  gib_no text primary key,
  mikro_id text,
  vkn text,
  tedarikci text,
  tarih date not null,
  tip text,
  toplam numeric,
  kalem_sayisi int not null default 0,
  aktarildi timestamptz not null default now(),
  aktaran text
);
alter table public.mikro_faturalar enable row level security;
create policy stok_deger_okuma on public.mikro_faturalar for select to authenticated
  using ((select public.stok_deger_yetkili()));

create table if not exists public.mikro_fatura_kalemleri (
  id bigint generated always as identity primary key,
  gib_no text not null references public.mikro_faturalar(gib_no) on delete cascade,
  sira int not null,
  urun_adi text not null,        -- normalleştirilmiş (büyük harf, irsaliye no/açıklama atılmış)
  ham_ad text,
  miktar numeric,
  birim text,
  birim_fiyat numeric not null,  -- KDV hariç
  kdv_orani numeric not null default 0,
  iskonto_orani numeric,
  tutar numeric,
  vkn text,
  tedarikci text,
  tarih date not null
);
alter table public.mikro_fatura_kalemleri enable row level security;
create policy stok_deger_okuma on public.mikro_fatura_kalemleri for select to authenticated
  using ((select public.stok_deger_yetkili()));
create index if not exists mikro_fatura_kalemleri_urun on public.mikro_fatura_kalemleri (urun_adi, vkn, tarih desc);
create index if not exists mikro_fatura_kalemleri_gib on public.mikro_fatura_kalemleri (gib_no);

-- ─── Yazma (sadece fonksiyonlar üzerinden) ───────────────────────────────────
-- p: [{gib_no, mikro_id, vkn, tedarikci, tarih, tip, toplam,
--      kalemler:[{sira, urun_adi, ham_ad, miktar, birim, birim_fiyat, kdv_orani, iskonto_orani, tutar}]}]
create or replace function public._mikro_faturalari_yaz(p jsonb, p_kim text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare f jsonb; n_fatura int := 0; v_gib text;
begin
  -- Kesilmiş fatura değişmez: daha önce aktarılan fatura atlanır (tekrar aktarım güvenli).
  for f in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v_gib := nullif(trim(f ->> 'gib_no'), '');
    if v_gib is null or (f ->> 'tarih') is null then continue; end if;
    insert into public.mikro_faturalar (gib_no, mikro_id, vkn, tedarikci, tarih, tip, toplam, kalem_sayisi, aktarildi, aktaran)
    values (v_gib, f ->> 'mikro_id', f ->> 'vkn', f ->> 'tedarikci', (f ->> 'tarih')::date, f ->> 'tip',
            nullif(f ->> 'toplam', '')::numeric, jsonb_array_length(coalesce(f -> 'kalemler', '[]'::jsonb)), now(), p_kim)
    on conflict (gib_no) do update set kalem_sayisi = excluded.kalem_sayisi, aktarildi = now(), aktaran = p_kim
      where public.mikro_faturalar.kalem_sayisi = 0;  -- daha önce kalemsiz kaydedildiyse kalemleri doldur
    if not found then continue; end if;
    insert into public.mikro_fatura_kalemleri (gib_no, sira, urun_adi, ham_ad, miktar, birim, birim_fiyat, kdv_orani, iskonto_orani, tutar, vkn, tedarikci, tarih)
    select v_gib, coalesce((k ->> 'sira')::int, o::int),
           regexp_replace(trim(k ->> 'urun_adi'), '\s+', ' ', 'g'), k ->> 'ham_ad',
           nullif(k ->> 'miktar', '')::numeric, nullif(k ->> 'birim', ''),
           (k ->> 'birim_fiyat')::numeric, coalesce(nullif(k ->> 'kdv_orani', '')::numeric, 0),
           nullif(k ->> 'iskonto_orani', '')::numeric, nullif(k ->> 'tutar', '')::numeric,
           f ->> 'vkn', f ->> 'tedarikci', (f ->> 'tarih')::date
      from jsonb_array_elements(coalesce(f -> 'kalemler', '[]'::jsonb)) with ordinality as x(k, o)
     where nullif(trim(k ->> 'urun_adi'), '') is not null and (k ->> 'birim_fiyat') is not null;
    n_fatura := n_fatura + 1;
  end loop;
  return jsonb_build_object('fatura', n_fatura);
end $$;
revoke all on function public._mikro_faturalari_yaz(jsonb, text) from public, anon, authenticated;

-- Stok fiyatlarını en yeni fatura kalemine göre günceller. %30'dan büyük değişim → kontrol listesi.
create or replace function public._stok_fiyatlari_esitle(p_kim text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare sf record; k record; v_oran numeric; guncellenen jsonb := '[]'; kontrol jsonb := '[]';
begin
  for sf in select f.*, u.urun_adi as stok_adi from public.stok_fiyatlar f join public.stok_urunler u on u.id = f.urun_id loop
    select * into k from public.mikro_fatura_kalemleri m
     where m.vkn = sf.tedarikci_vkn and m.urun_adi = regexp_replace(trim(sf.fatura_kalem_adi), '\s+', ' ', 'g')
     order by m.tarih desc, m.gib_no desc limit 1;
    if not found then continue; end if;
    if k.tarih < coalesce(sf.fatura_tarihi, date '1900-01-01') then continue; end if;
    if k.tarih = sf.fatura_tarihi and abs(k.birim_fiyat - sf.fatura_birim_fiyat) < 0.00005 then
      if sf.fatura_no is null then update public.stok_fiyatlar set fatura_no = k.gib_no where urun_id = sf.urun_id; end if;
      continue;
    end if;
    v_oran := case when sf.fatura_birim_fiyat > 0 then abs(k.birim_fiyat - sf.fatura_birim_fiyat) / sf.fatura_birim_fiyat else 1 end;
    if v_oran > 0.3 then
      kontrol := kontrol || jsonb_build_object('urun_id', sf.urun_id, 'urun', sf.stok_adi, 'eski', sf.fatura_birim_fiyat,
        'yeni', k.birim_fiyat, 'oran', round(v_oran * 100), 'fatura', k.gib_no, 'tarih', k.tarih);
      continue;
    end if;
    update public.stok_fiyatlar set fatura_birim_fiyat = k.birim_fiyat, kdv_orani = k.kdv_orani, fatura_no = k.gib_no,
      fatura_tarihi = k.tarih, guncellendi = now(), guncelleyen = p_kim where urun_id = sf.urun_id;
    if abs(k.birim_fiyat - sf.fatura_birim_fiyat) >= 0.00005 then
      guncellenen := guncellenen || jsonb_build_object('urun', sf.stok_adi, 'eski', sf.fatura_birim_fiyat, 'yeni', k.birim_fiyat, 'fatura', k.gib_no);
    end if;
  end loop;
  return jsonb_build_object('guncellenen', guncellenen, 'kontrol', kontrol);
end $$;
revoke all on function public._stok_fiyatlari_esitle(text) from public, anon, authenticated;

-- Panelden çağrılan: faturaları yaz, stok fiyatlarını eşitle, kaydı tut.
create or replace function public.mikro_faturalari_kaydet(p_faturalar jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_kim text := coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel');
        y jsonb; e jsonb; v_mesaj text;
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  y := public._mikro_faturalari_yaz(p_faturalar, v_kim);
  e := public._stok_fiyatlari_esitle(v_kim || ' (Mikro aktarımı)');
  v_mesaj := format('%s yeni fatura aktarıldı, %s stok fiyatı güncellendi', y ->> 'fatura', jsonb_array_length(e -> 'guncellenen'))
    || case when jsonb_array_length(e -> 'kontrol') > 0 then format(', %s değişim kontrol bekliyor.', jsonb_array_length(e -> 'kontrol')) else '.' end;
  insert into public.stok_fiyat_bot_log (bitti, durum, okunan_fatura, guncellenen, kontrol_gereken, mesaj, detay)
  values (now(), 'basarili', (y ->> 'fatura')::int, jsonb_array_length(e -> 'guncellenen'), jsonb_array_length(e -> 'kontrol'),
          v_mesaj, e || jsonb_build_object('kim', v_kim));
  return e || jsonb_build_object('fatura', (y ->> 'fatura')::int, 'mesaj', v_mesaj);
end $$;
revoke all on function public.mikro_faturalari_kaydet(jsonb) from public, anon;
grant execute on function public.mikro_faturalari_kaydet(jsonb) to authenticated;

-- %30'dan büyük değişimi elle onaylama: ürünün en yeni fatura fiyatını uygular.
create or replace function public.stok_fiyat_kontrol_onayla(p_urun_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sf public.stok_fiyatlar; k record;
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  select * into sf from public.stok_fiyatlar where urun_id = p_urun_id;
  if not found then raise exception 'Ürünün fiyat eşleşmesi yok.'; end if;
  select * into k from public.mikro_fatura_kalemleri m
   where m.vkn = sf.tedarikci_vkn and m.urun_adi = regexp_replace(trim(sf.fatura_kalem_adi), '\s+', ' ', 'g')
   order by m.tarih desc, m.gib_no desc limit 1;
  if not found then raise exception 'Bu ürün için aktarılmış fatura yok.'; end if;
  update public.stok_fiyatlar set fatura_birim_fiyat = k.birim_fiyat, kdv_orani = k.kdv_orani, fatura_no = k.gib_no,
    fatura_tarihi = k.tarih, guncellendi = now(),
    guncelleyen = coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel') || ' (elle onay)'
   where urun_id = p_urun_id;
end $$;
revoke all on function public.stok_fiyat_kontrol_onayla(uuid) from public, anon;
grant execute on function public.stok_fiyat_kontrol_onayla(uuid) to authenticated;

-- ─── Okuma ──────────────────────────────────────────────────────────────────
-- Her ürün × tedarikçi için son alış fiyatı, bir önceki fiyat, en düşük/en yüksek, alım sayısı.
create or replace function public.fiyat_listesi()
returns table (urun_adi text, vkn text, tedarikci text, birim text, son_fiyat numeric, son_kdv numeric,
               son_tarih date, son_fatura text, onceki_fiyat numeric, onceki_tarih date,
               en_dusuk numeric, en_yuksek numeric, alim_sayisi int, toplam_miktar numeric, ilk_tarih date)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query
  with s as (
    select k.*, row_number() over (partition by k.urun_adi, k.vkn order by k.tarih desc, k.gib_no desc, k.sira) rn
      from public.mikro_fatura_kalemleri k where k.birim_fiyat > 0
  ), ozet as (
    select s.urun_adi, s.vkn, min(s.birim_fiyat) mn, max(s.birim_fiyat) mx, count(distinct s.gib_no)::int n,
           sum(coalesce(s.miktar, 0)) tm, min(s.tarih) ilk
      from s group by s.urun_adi, s.vkn
  ), onceki as (
    -- son alımdan önceki ilk farklı günün fiyatı
    select distinct on (s.urun_adi, s.vkn) s.urun_adi, s.vkn, s.birim_fiyat, s.tarih
      from s join s son on son.urun_adi = s.urun_adi and son.vkn is not distinct from s.vkn and son.rn = 1
     where s.tarih < son.tarih
     order by s.urun_adi, s.vkn, s.tarih desc, s.gib_no desc
  )
  select s.urun_adi, s.vkn, s.tedarikci, s.birim, s.birim_fiyat, s.kdv_orani, s.tarih, s.gib_no,
         o.birim_fiyat, o.tarih, z.mn, z.mx, z.n, z.tm, z.ilk
    from s join ozet z on z.urun_adi = s.urun_adi and z.vkn is not distinct from s.vkn
    left join onceki o on o.urun_adi = s.urun_adi and o.vkn is not distinct from s.vkn
   where s.rn = 1
   order by s.tarih desc, s.urun_adi;
end $$;
revoke all on function public.fiyat_listesi() from public, anon;
grant execute on function public.fiyat_listesi() to authenticated;

create or replace function public.fiyat_gecmisi(p_urun_adi text, p_vkn text)
returns table (tarih date, gib_no text, miktar numeric, birim text, birim_fiyat numeric, kdv_orani numeric,
               iskonto_orani numeric, tutar numeric)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return query select k.tarih, k.gib_no, k.miktar, k.birim, k.birim_fiyat, k.kdv_orani, k.iskonto_orani, k.tutar
    from public.mikro_fatura_kalemleri k
   where k.urun_adi = p_urun_adi and k.vkn is not distinct from p_vkn
   order by k.tarih desc, k.gib_no desc limit 200;
end $$;
revoke all on function public.fiyat_gecmisi(text, text) from public, anon;
grant execute on function public.fiyat_gecmisi(text, text) to authenticated;

-- Aktarımın nereden başlayacağı: son aktarılan faturadan 7 gün öncesi (yoksa yılbaşı)
create or replace function public.mikro_aktarim_baslangici()
returns date language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.stok_deger_yetkili() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return coalesce((select max(tarih) from public.mikro_faturalar) - 7, date_trunc('year', now())::date);
end $$;
revoke all on function public.mikro_aktarim_baslangici() from public, anon;
grant execute on function public.mikro_aktarim_baslangici() to authenticated;
