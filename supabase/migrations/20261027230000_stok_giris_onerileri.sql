-- ─── FATURADAN STOK GİRİŞİ (ONAYLI) ──────────────────────────────────────────
-- Mikro'dan gelen her fatura kalemi için bir "stok girişi önerisi" oluşur:
--   • Kalem daha önce bir stok ürünüyle eşleştirildiyse (stok_kalem_eslesme) ürün ve çarpan hazır gelir
--     (ör. "AYRAN 200 ML" 20 adet → AYRAN 20 adet; "TAVUK DÖNER" 3 koli × 10 = 30 kg).
--   • Eşleşme yoksa öneri "eşleştirilecek" bekler; panelde ürün seçilip "hatırla" denirse bir dahaki sefere otomatik.
--   • Stokta takip edilmeyen kalemler (elektrik, internet…) "takip etme" ile bir kez işaretlenir, bir daha sorulmaz.
-- Onaylanınca stok_hareketler'e fatura tarihiyle "giris" yazılır (iade faturasında "cikis / iade").
-- Telegram'a fatura bazında "stoğa işlensin mi?" mesajı gider (pg_net → /api/telegram/olay).

create table if not exists public.stok_kalem_eslesme (
  vkn text not null,
  kalem_adi text not null,
  urun_id uuid references public.stok_urunler(id) on delete cascade,
  carpan numeric not null default 1 check (carpan > 0),
  yoksay boolean not null default false,
  guncelleyen text,
  guncellendi timestamptz not null default now(),
  primary key (vkn, kalem_adi)
);
alter table public.stok_kalem_eslesme enable row level security;
drop policy if exists stok_kalem_eslesme_oku on public.stok_kalem_eslesme;
create policy stok_kalem_eslesme_oku on public.stok_kalem_eslesme for select to authenticated using (public.kebo_izin('stok'));

-- Mevcut fiyat eşleşmeleri (Fiyat Listesi) başlangıç olarak alınır
insert into public.stok_kalem_eslesme (vkn, kalem_adi, urun_id, carpan, guncelleyen)
select f.tedarikci_vkn, regexp_replace(trim(f.fatura_kalem_adi), '\s+', ' ', 'g'), f.urun_id, coalesce(f.carpan, 1), 'fiyat listesi'
  from public.stok_fiyatlar f
 where nullif(trim(f.tedarikci_vkn), '') is not null and nullif(trim(f.fatura_kalem_adi), '') is not null
on conflict do nothing;

create table if not exists public.stok_giris_onerileri (
  id uuid primary key default gen_random_uuid(),
  kalem_id bigint unique references public.mikro_fatura_kalemleri(id) on delete cascade,
  gib_no text not null,
  sira int,
  tarih date not null,
  tedarikci text,
  vkn text,
  iade boolean not null default false,
  kalem_adi text not null,
  fatura_miktar numeric,
  fatura_birim text,
  fatura_birim_fiyat numeric,          -- iskontolu net, KDV hariç (fatura birimi başına)
  urun_id uuid references public.stok_urunler(id) on delete set null,
  carpan numeric not null default 1,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  hareket_id uuid,
  karar_veren text,
  karar_zamani timestamptz,
  bildirildi boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists stok_giris_onerileri_bekleyen on public.stok_giris_onerileri (tarih) where durum = 'bekliyor';
alter table public.stok_giris_onerileri enable row level security;
drop policy if exists stok_giris_onerileri_oku on public.stok_giris_onerileri;
create policy stok_giris_onerileri_oku on public.stok_giris_onerileri for select to authenticated using (public.kebo_izin('stok'));

-- Yeni fatura kalemi → öneri
create or replace function public._stok_giris_onerisi_olustur()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare e public.stok_kalem_eslesme%rowtype; v_iade boolean;
begin
  select * into e from public.stok_kalem_eslesme where vkn = new.vkn and kalem_adi = new.urun_adi;
  if found and e.yoksay then return null; end if;
  select coalesce(tip, '') = 'IADE' into v_iade from public.mikro_faturalar where gib_no = new.gib_no;
  insert into public.stok_giris_onerileri (kalem_id, gib_no, sira, tarih, tedarikci, vkn, iade, kalem_adi, fatura_miktar, fatura_birim,
                                           fatura_birim_fiyat, urun_id, carpan)
  values (new.id, new.gib_no, new.sira, new.tarih, new.tedarikci, new.vkn, coalesce(v_iade, false), new.urun_adi, new.miktar, new.birim,
          public.kalem_net_fiyat(new.tutar, new.miktar, new.birim_fiyat), e.urun_id, coalesce(e.carpan, 1))
  on conflict (kalem_id) do nothing;
  return null;
end $$;
drop trigger if exists trg_stok_giris_onerisi on public.mikro_fatura_kalemleri;
create trigger trg_stok_giris_onerisi after insert on public.mikro_fatura_kalemleri
  for each row execute function public._stok_giris_onerisi_olustur();

-- Yeni öneri gelince Telegram'a haber ver (bir çalışmada birden çok kez tetiklense de mesaj bir kez gider)
create or replace function public._stok_giris_bildir()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if exists (select 1 from public.telegram_ayar) then
    begin
      perform net.http_post(url := 'https://kebo-panel.vercel.app/api/telegram/olay',
        body := jsonb_build_object('tur', 'stok_giris'), headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then null;
    end;
  end if;
  return null;
end $$;
drop trigger if exists trg_stok_giris_bildir on public.stok_giris_onerileri;
create trigger trg_stok_giris_bildir after insert on public.stok_giris_onerileri
  for each statement execute function public._stok_giris_bildir();

-- ── Karar (panel ve Telegram ortak çekirdek) ──
-- p_kararlar: [{id, karar: 'onayla'|'reddet'|'takip_etme', urun_id?, carpan?, hatirla?}]
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
      values (v_urun, o.kalem_adi, o.vkn, o.tedarikci, coalesce(o.fatura_birim_fiyat, 0), v_carpan, o.gib_no, o.tarih, now(), p_kim)
      on conflict (urun_id) do nothing;
    end if;
    if not o.iade and o.fatura_birim_fiyat is not null then
      update public.stok_urunler set son_fiyat = round(o.fatura_birim_fiyat / v_carpan, 4) where id = v_urun;
    end if;
    n_onay := n_onay + 1;
  end loop;
  return jsonb_build_object('onaylanan', n_onay, 'reddedilen', n_red, 'urunu_eksik', n_eksik);
end $$;
revoke all on function public._stok_giris_karar(jsonb, text), public._stok_giris_onerisi_olustur(), public._stok_giris_bildir() from public, anon, authenticated;

create or replace function public.stok_giris_karar(p_kararlar jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kebo_izin('stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  return public._stok_giris_karar(p_kararlar, coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel'));
end $$;
grant execute on function public.stok_giris_karar(jsonb) to authenticated;

-- Aynı ürüne aynı günlerde irsaliyeden de giriş yapılmış mı? (çift giriş uyarısı)
create or replace function public.stok_giris_cift_kontrol()
returns table (oneri_id uuid, hareket_tarihi date, miktar numeric, kaynak text)
language sql stable security invoker set search_path to 'public' as $$
  select o.id, h.tarih, h.miktar, h.kaynak
    from public.stok_giris_onerileri o
    join public.stok_hareketler h on h.urun_id = o.urun_id and h.tip = 'giris' and h.kaynak <> 'fatura'
         and h.tarih between o.tarih - 3 and o.tarih + 3
   where o.durum = 'bekliyor'
$$;
grant execute on function public.stok_giris_cift_kontrol() to authenticated;

-- ── Telegram ──
-- Bildirilmemiş bekleyen önerileri fatura bazında döndürür ve "bildirildi" yapar; alıcılar: stok yetkili bağlı sohbetler
create or replace function public.tg_stok_giris_bildirilecek(p_anahtar text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_gib text[];
begin
  if not public._tg_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  with x as (update public.stok_giris_onerileri set bildirildi = true where durum = 'bekliyor' and not bildirildi returning gib_no)
  select array_agg(distinct gib_no) into v_gib from x;
  if v_gib is null then return jsonb_build_object('faturalar', '[]'::jsonb, 'chatler', '[]'::jsonb); end if;
  return jsonb_build_object(
    'faturalar', (select jsonb_agg(public._tg_stok_fatura(g)) from unnest(v_gib) g),
    'chatler', coalesce((select jsonb_agg(b.chat_id) from public.telegram_baglantilar b
                          where public._tg_izin(b.user_id, 'stok') and b.oglen_uyarisi), '[]'::jsonb));
end $$;

create or replace function public._tg_stok_fatura(p_gib text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('gib_no', p_gib,
    'tarih', min(o.tarih), 'tedarikci', min(o.tedarikci), 'iade', bool_or(o.iade),
    'kalemler', jsonb_agg(jsonb_build_object('id', o.id, 'kalem', o.kalem_adi, 'miktar', o.fatura_miktar, 'birim', o.fatura_birim,
        'urun', u.urun_adi, 'urun_birim', u.birim, 'stok_miktar', round(o.fatura_miktar * o.carpan, 3), 'durum', o.durum) order by o.sira))
  from public.stok_giris_onerileri o left join public.stok_urunler u on u.id = o.urun_id
  where o.gib_no = p_gib
$$;
revoke all on function public._tg_stok_fatura(text) from public, anon, authenticated;

create or replace function public.tg_stok_fatura(p_anahtar text, p_chat bigint, p_gib text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat);
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  return public._tg_stok_fatura(p_gib);
end $$;

-- Telegram'dan "bu faturayı stoğa işle": eşleşmiş bekleyen kalemleri onaylar, eşleşmemişler bekler
create or replace function public.tg_stok_giris_onayla(p_anahtar text, p_chat bigint, p_gib text, p_karar text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_ad text; r jsonb;
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  select public._stok_giris_karar(coalesce(jsonb_agg(jsonb_build_object('id', id, 'karar', case when p_karar = 'reddet' then 'reddet' else 'onayla' end)), '[]'::jsonb), v_ad)
    into r from public.stok_giris_onerileri
   where gib_no = p_gib and durum = 'bekliyor' and (p_karar = 'reddet' or urun_id is not null);
  return r || jsonb_build_object('kalan', (select count(*) from public.stok_giris_onerileri where gib_no = p_gib and durum = 'bekliyor'));
end $$;

create or replace function public.tg_stok_giris_bekleyen(p_anahtar text, p_chat bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat);
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(public._tg_stok_fatura(g) order by t)
    from (select gib_no g, min(tarih) t from public.stok_giris_onerileri where durum = 'bekliyor' group by gib_no) x), '[]'::jsonb);
end $$;
grant execute on function public.tg_stok_giris_bildirilecek(text), public.tg_stok_fatura(text, bigint, text),
  public.tg_stok_giris_onayla(text, bigint, text, text), public.tg_stok_giris_bekleyen(text, bigint) to anon, authenticated;
