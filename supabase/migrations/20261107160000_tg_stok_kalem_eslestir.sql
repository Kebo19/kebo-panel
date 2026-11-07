-- Telegram: fatura bildiriminden kalem eşleştirme ("✅ Stoğa işle" eşleşmemiş kalemlerde de çalışsın).
-- Akış: bot eşleşmemiş kalemi sorar → kullanıcı ürün adı yazar → tg_stok_urun_ara → ürün seçilir →
-- tg_stok_kalem_karar (onayla + hatırla). Bir kez eşleşen kalem bu firmadan sonraki faturalarda kendiliğinden gelir.

-- Türkçe harf duyarsız arama için sadeleştirme
create or replace function public._tr_sade(p text)
returns text language sql immutable set search_path to 'public' as $$
  select lower(translate(coalesce(p, ''), 'İIıŞşÇçĞğÜüÖöÂâÎîÛû', 'iiissccgguuooaaiiuu'))
$$;

-- Aktif stok ürünlerinde arama (her kelime geçmeli), en fazla 8 sonuç
create or replace function public.tg_stok_urun_ara(p_anahtar text, p_chat bigint, p_q text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_kel text[];
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  v_kel := array_remove(regexp_split_to_array(public._tr_sade(trim(p_q)), '\s+'), '');
  if coalesce(array_length(v_kel, 1), 0) = 0 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'urun_adi', x.urun_adi, 'birim', x.birim) order by x.basta desc, length(x.urun_adi))
      from (select u.id, u.urun_adi, u.birim, public._tr_sade(u.urun_adi) like v_kel[1] || '%' as basta
              from public.stok_urunler u
             where coalesce(u.durum, 'aktif') = 'aktif'
               and not exists (select 1 from unnest(v_kel) w where public._tr_sade(u.urun_adi) not like '%' || w || '%')
             order by 4 desc, length(u.urun_adi)
             limit 8) x), '[]'::jsonb);
end $$;

-- Tek kalem kararı: 'onayla' (ürün + çarpan, eşleşme hatırlanır) | 'takip_etme' (bu kalem bir daha sorulmaz) | 'reddet'
create or replace function public.tg_stok_kalem_karar(p_anahtar text, p_chat bigint, p_oneri uuid, p_karar text,
                                                      p_urun uuid default null, p_carpan numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_ad text; v_gib text; r jsonb;
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  if p_karar not in ('onayla', 'takip_etme', 'reddet') then raise exception 'Geçersiz karar'; end if;
  if p_karar = 'onayla' and p_urun is null then raise exception 'Ürün seçilmedi.'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  select gib_no into v_gib from public.stok_giris_onerileri where id = p_oneri;
  r := public._stok_giris_karar(jsonb_build_array(jsonb_build_object(
         'id', p_oneri, 'karar', p_karar, 'urun_id', p_urun, 'carpan', p_carpan, 'hatirla', true)), coalesce(v_ad, 'telegram'));
  return r || jsonb_build_object('gib_no', v_gib,
    'kalan', (select count(*) from public.stok_giris_onerileri where gib_no = v_gib and durum = 'bekliyor'));
end $$;

revoke all on function public._tr_sade(text) from public, anon, authenticated;
grant execute on function public._tr_sade(text) to service_role;
revoke all on function public.tg_stok_urun_ara(text, bigint, text), public.tg_stok_kalem_karar(text, bigint, uuid, text, uuid, numeric) from public;
grant execute on function public.tg_stok_urun_ara(text, bigint, text), public.tg_stok_kalem_karar(text, bigint, uuid, text, uuid, numeric)
  to anon, authenticated, service_role;
