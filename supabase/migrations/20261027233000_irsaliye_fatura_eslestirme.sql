-- ─── İRSALİYE ÖNCE, FATURA SONRA ─────────────────────────────────────────────
-- Mal gelince irsaliye girilir ve teslim alınır (stoğa o an girer). Fatura Mikro'dan sonra gelince
-- sistem aynı tedarikçinin (VKN) yakın tarihli, henüz faturası bağlanmamış irsaliyesini bulur ve
-- kalem kalem karşılaştırır: irsaliye 30 kg / fatura 30 kg ✓, irsaliye 20 / fatura 24 (+4) …
-- Onaylanınca fatura kalemleri irsaliyeye bağlanır: stoğa İKİNCİ KEZ girmez; istenirse fark
-- faturaya göre düzeltilir. İrsaliyesi olmayan fatura kalemleri eskisi gibi "stoğa işlensin mi?" bekler.

alter table public.stok_fatura_kalemleri add column if not exists fatura_gib text;
alter table public.stok_giris_onerileri add column if not exists irsaliye_kalem_id uuid;
create index if not exists stok_fatura_kalemleri_bagsiz on public.stok_fatura_kalemleri (cari_id) where fatura_gib is null;

-- Bir faturanın en uygun irsaliyesi ve kalem karşılaştırması
create or replace function public._irsaliye_eslesme(p_gib text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare f record; v_belge text; r jsonb;
begin
  select min(o.tarih) tarih, min(o.vkn) vkn, min(o.tedarikci) tedarikci into f
    from public.stok_giris_onerileri o where o.gib_no = p_gib;
  if f.tarih is null then return null; end if;

  -- Aday irsaliyeler: aynı VKN'li cari (ya da cari seçilmemişse tedarikçi adının ilk kelimesi), faturası bağlanmamış,
  -- fatura tarihinden en çok 20 gün önce / 5 gün sonra. En çok ürünü örtüşen, sonra tarihi en yakın olan seçilir.
  with aday as (
    select coalesce(k.belge_id::text, k.id::text) belge, k.*
      from public.stok_fatura_kalemleri k left join public.cariler c on c.id = k.cari_id
     where k.fatura_gib is null and k.durum in ('teslim', 'bekliyor')
       and coalesce(k.teslim_tarihi, k.fatura_tarihi, k.beklenen_tarih, k.created_at::date) between f.tarih - 20 and f.tarih + 5
       and ((c.vergi_no is not null and trim(c.vergi_no) = trim(f.vkn))
            or (k.cari_id is null and split_part(upper(coalesce(k.tedarikci, '')), ' ', 1) <> ''
                and upper(coalesce(f.tedarikci, '')) like split_part(upper(k.tedarikci), ' ', 1) || '%'))
  ), puan as (
    select a.belge,
           count(*) filter (where exists (select 1 from public.stok_giris_onerileri o where o.gib_no = p_gib and o.urun_id = a.urun_id)) ortak,
           min(abs(coalesce(a.teslim_tarihi, a.fatura_tarihi, a.beklenen_tarih, a.created_at::date) - f.tarih)) uzaklik
      from aday a group by a.belge
  )
  select belge into v_belge from puan order by ortak desc, uzaklik limit 1;
  if v_belge is null then return null; end if;

  with ik as (
    select k.*, coalesce(k.teslim_miktar, k.miktar) irs_miktar, u.urun_adi, u.birim urun_birim
      from public.stok_fatura_kalemleri k left join public.stok_urunler u on u.id = k.urun_id
     where coalesce(k.belge_id::text, k.id::text) = v_belge and k.fatura_gib is null and k.durum in ('teslim', 'bekliyor')
  ), fo as (
    select o.*, round(coalesce(o.fatura_miktar, 0) * o.carpan, 3) stok_miktar from public.stok_giris_onerileri o
     where o.gib_no = p_gib and o.durum = 'bekliyor'
  ), eslesen as (
    select distinct on (fo.id) fo.id oneri_id, ik.id irsaliye_kalem_id
      from fo join ik on ik.urun_id = fo.urun_id order by fo.id, abs(ik.irs_miktar - fo.stok_miktar)
  )
  select jsonb_build_object(
    'belge', v_belge,
    'belge_no', (select min(fatura_no) from ik),
    'tarih', (select min(coalesce(teslim_tarihi, fatura_tarihi, beklenen_tarih)) from ik),
    'teslim', (select bool_and(durum = 'teslim') from ik),
    'satirlar', coalesce((select jsonb_agg(jsonb_build_object('oneri_id', fo.id, 'kalem', fo.kalem_adi, 'urun', ik.urun_adi, 'birim', ik.urun_birim,
          'irsaliye_kalem_id', ik.id, 'irsaliye_miktar', ik.irs_miktar, 'fatura_miktar', fo.stok_miktar,
          'fark', round(fo.stok_miktar - ik.irs_miktar, 3), 'teslim', ik.durum = 'teslim') order by fo.sira)
        from eslesen e join fo on fo.id = e.oneri_id join ik on ik.id = e.irsaliye_kalem_id), '[]'::jsonb),
    'faturada_olmayan', coalesce((select jsonb_agg(jsonb_build_object('irsaliye_kalem_id', ik.id, 'urun', coalesce(ik.urun_adi, ik.urun_adi_ham), 'miktar', ik.irs_miktar, 'birim', ik.urun_birim))
        from ik where ik.id not in (select irsaliye_kalem_id from eslesen)), '[]'::jsonb),
    'irsaliyede_olmayan', coalesce((select jsonb_agg(jsonb_build_object('oneri_id', fo.id, 'kalem', fo.kalem_adi, 'miktar', fo.fatura_miktar, 'birim', fo.fatura_birim, 'eslesmis', fo.urun_id is not null))
        from fo where fo.id not in (select oneri_id from eslesen)), '[]'::jsonb))
  into r;
  return r;
end $$;
revoke all on function public._irsaliye_eslesme(text) from public, anon, authenticated;

-- Bağlama çekirdeği. p_baglar: [{oneri_id, irsaliye_kalem_id, fark_isle}]
--  • irsaliye teslim alınmışsa: stoğa yeni giriş yok; fark_isle ise (fatura − irsaliye) kadar düzeltme
--  • irsaliye henüz teslim alınmamışsa: fatura miktarıyla teslim alınmış sayılır (tek giriş)
--  • faturadaki kalem bir ürünle eşleşmemişse ürün irsaliyeden alınır, çarpan oran olarak öğrenilir
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
      values (k.urun_id, o.kalem_adi, o.vkn, o.tedarikci, coalesce(o.fatura_birim_fiyat, 0), v_carpan, o.gib_no, o.tarih, now(), p_kim)
      on conflict (urun_id) do nothing;
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
revoke all on function public._irsaliye_bagla(jsonb, text) from public, anon, authenticated;

-- ── Panel ──
create or replace function public.irsaliye_eslesmeleri()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kebo_izin('stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(g, e) from (
    select g, public._irsaliye_eslesme(g) e from (select distinct gib_no g from public.stok_giris_onerileri where durum = 'bekliyor') x) y
    where e is not null), '{}'::jsonb);
end $$;

create or replace function public.irsaliye_bagla(p_baglar jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kebo_izin('stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  return public._irsaliye_bagla(p_baglar, coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel'));
end $$;
grant execute on function public.irsaliye_eslesmeleri(), public.irsaliye_bagla(jsonb) to authenticated;

-- ── Telegram ── Fatura bilgisine irsaliye karşılaştırması da eklenir
create or replace function public._tg_stok_fatura(p_gib text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('gib_no', p_gib,
    'tarih', min(o.tarih), 'tedarikci', min(o.tedarikci), 'iade', bool_or(o.iade),
    'kalemler', jsonb_agg(jsonb_build_object('id', o.id, 'kalem', o.kalem_adi, 'miktar', o.fatura_miktar, 'birim', o.fatura_birim,
        'urun', u.urun_adi, 'urun_birim', u.birim, 'stok_miktar', round(o.fatura_miktar * o.carpan, 3), 'durum', o.durum) order by o.sira),
    'irsaliye', public._irsaliye_eslesme(p_gib))
  from public.stok_giris_onerileri o left join public.stok_urunler u on u.id = o.urun_id
  where o.gib_no = p_gib
$$;

-- Telegram'dan "irsaliyeyle eşleştir": ürünü eşleşen satırlar bağlanır; p_fark = 'fatura' ise fark faturaya göre düzeltilir
create or replace function public.tg_irsaliye_bagla(p_anahtar text, p_chat bigint, p_gib text, p_fark text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_ad text; e jsonb;
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  e := public._irsaliye_eslesme(p_gib);
  if e is null then return jsonb_build_object('baglanan', 0); end if;
  return public._irsaliye_bagla((select coalesce(jsonb_agg(jsonb_build_object('oneri_id', s ->> 'oneri_id', 'irsaliye_kalem_id', s ->> 'irsaliye_kalem_id',
           'fark_isle', p_fark = 'fatura')), '[]'::jsonb) from jsonb_array_elements(e -> 'satirlar') s), v_ad)
    || jsonb_build_object('kalan', (select count(*) from public.stok_giris_onerileri where gib_no = p_gib and durum = 'bekliyor'));
end $$;
grant execute on function public.tg_irsaliye_bagla(text, bigint, text, text) to anon, authenticated;

-- "Bu irsaliyenin faturası hangisi / bu faturanın irsaliyesi hangisi?" sorgusu (panel ve Telegram).
create or replace function public._belge_eslesme_ara(p_q text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') s),
  irs as (
    select coalesce(k.belge_id::text, k.id::text) belge, min(k.fatura_no) irsaliye_no, min(coalesce(c.unvan, k.tedarikci)) tedarikci,
           min(coalesce(k.teslim_tarihi, k.fatura_tarihi, k.beklenen_tarih)) tarih, bool_and(k.durum = 'teslim') teslim,
           min(k.fatura_gib) fatura_gib,
           string_agg(coalesce(u.urun_adi, k.urun_adi_ham) || ' ' || coalesce(k.teslim_miktar, k.miktar)::text || ' ' || coalesce(u.birim, k.birim, ''), ', ' order by k.created_at) kalemler
      from public.stok_fatura_kalemleri k left join public.cariler c on c.id = k.cari_id left join public.stok_urunler u on u.id = k.urun_id
     where k.durum <> 'iptal' and coalesce(k.teslim_tarihi, k.fatura_tarihi, k.beklenen_tarih, k.created_at::date) >= current_date - 180
     group by 1
  ), sat as (
    select i.belge, i.irsaliye_no, i.tedarikci, i.tarih irsaliye_tarihi, i.teslim, i.kalemler,
           m.gib_no, m.tarih fatura_tarihi, m.toplam, m.tedarikci fatura_tedarikci
      from irs i left join public.mikro_faturalar m on m.gib_no = i.fatura_gib
    union all
    select null, null, null, null, null, null, m.gib_no, m.tarih, m.toplam, m.tedarikci
      from public.mikro_faturalar m
     where m.tarih >= current_date - 180 and not exists (select 1 from public.stok_fatura_kalemleri k where k.fatura_gib = m.gib_no)
       and (select s from q) is not null
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by coalesce(x.fatura_tarihi, x.irsaliye_tarihi) desc nulls last), '[]'::jsonb) from (
    select * from sat, q
     where q.s is null
        or upper(coalesce(irsaliye_no, '')) like '%' || upper(q.s) || '%'
        or upper(coalesce(gib_no, '')) like '%' || upper(q.s) || '%'
        or upper(coalesce(tedarikci, '') || ' ' || coalesce(fatura_tedarikci, '')) like '%' || upper(q.s) || '%'
     order by coalesce(fatura_tarihi, irsaliye_tarihi) desc nulls last limit 30) x
$$;
revoke all on function public._belge_eslesme_ara(text) from public, anon, authenticated;

create or replace function public.belge_eslesme_ara(p_q text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.kebo_izin('stok') or public.kebo_izin('cari')) then raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501'; end if;
  return public._belge_eslesme_ara(p_q);
end $$;
grant execute on function public.belge_eslesme_ara(text) to authenticated;

create or replace function public.tg_belge_eslesme_ara(p_anahtar text, p_chat bigint, p_q text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat);
begin
  if v is null or not (public._tg_izin(v, 'stok') or public._tg_izin(v, 'cari')) then raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501'; end if;
  return public._belge_eslesme_ara(p_q);
end $$;
grant execute on function public.tg_belge_eslesme_ara(text, bigint, text) to anon, authenticated;
