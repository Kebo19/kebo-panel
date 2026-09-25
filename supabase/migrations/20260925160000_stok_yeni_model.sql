-- ════════════════════════════════════════════════════════════════════════════
-- KEBO Panel — fonksiyon yetkileri ve yeni stok modeli (25.09.2026)
-- (Canlı veritabanına uygulandı; kayıt amaçlı.)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Fonksiyon yetkileri ────────────────────────────────────────────────────
revoke execute on function public.kebo_kasa_ayna() from public, anon, authenticated;
revoke execute on function public.kebo_rol_senkron() from public, anon, authenticated;
revoke execute on function public.kebo_rol() from public, anon;
revoke execute on function public.kebo_kullanici() from public, anon;
revoke execute on function public.kebo_tam_yetkili() from public, anon;
grant execute on function public.kebo_rol() to authenticated;
grant execute on function public.kebo_kullanici() to authenticated;
grant execute on function public.kebo_tam_yetkili() to authenticated;

-- ─── Çıkış nedeni, giriş fiyatı ─────────────────────────────────────────────
alter table public.stok_hareketler
  add column if not exists neden text,
  add column if not exists birim_fiyat numeric;
alter table public.stok_hareketler
  drop constraint if exists stok_hareketler_neden_kontrol,
  add constraint stok_hareketler_neden_kontrol check (neden is null or neden in ('skt', 'bozuk', 'iade', 'diger'));
alter table public.stok_hareketler
  drop constraint if exists stok_hareketler_miktar_kontrol,
  add constraint stok_hareketler_miktar_kontrol check (tip = 'duzeltme' or miktar >= 0);
create index if not exists stok_hareketler_urun_tarih_idx on public.stok_hareketler (urun_id, tarih);

-- ─── Sayım saati (sabah = gün başı, akşam = gün sonu) ───────────────────────
alter table public.stok_hareketler add column if not exists vakit text;
update public.stok_hareketler set vakit = 'sabah' where tip = 'sayim' and vakit is null;
alter table public.stok_hareketler
  drop constraint if exists stok_hareketler_vakit_kontrol,
  add constraint stok_hareketler_vakit_kontrol check (vakit is null or vakit in ('sabah', 'aksam'));

create or replace function public.stok_hareket_sirasi(p_tip text, p_vakit text)
returns int language sql immutable set search_path = public as $$
  select case when p_tip = 'sayim' and p_vakit = 'aksam' then 2 when p_tip = 'sayim' then 0 else 1 end
$$;

create or replace function public.update_mevcut_stok()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_urun uuid;
  v_son_sayim numeric; v_sayim_tarihi date; v_sayim_sira int; v_sayim_zamani timestamptz;
  v_fark numeric;
begin
  foreach v_urun in array array_remove(array[
      case when tg_op <> 'INSERT' then old.urun_id end,
      case when tg_op <> 'DELETE' then new.urun_id end], null)
  loop
    select miktar, tarih, stok_hareket_sirasi(tip, vakit), created_at
      into v_son_sayim, v_sayim_tarihi, v_sayim_sira, v_sayim_zamani
      from public.stok_hareketler
     where urun_id = v_urun and tip = 'sayim'
     order by tarih desc, stok_hareket_sirasi(tip, vakit) desc, created_at desc limit 1;

    select coalesce(sum(case tip when 'giris' then miktar when 'cikis' then -miktar when 'duzeltme' then miktar else 0 end), 0)
      into v_fark
      from public.stok_hareketler
     where urun_id = v_urun and tip <> 'sayim'
       and (v_sayim_tarihi is null or tarih > v_sayim_tarihi
            or (tarih = v_sayim_tarihi and stok_hareket_sirasi(tip, vakit) > v_sayim_sira));

    update public.stok_urunler
       set mevcut_stok = coalesce(v_son_sayim, 0) + v_fark, updated_at = now()
     where id = v_urun;
  end loop;
  return coalesce(new, old);
end $$;
revoke execute on function public.update_mevcut_stok() from public, anon, authenticated;

-- Mevcut stokları yeni kurala göre bir kez yeniden hesapla
update public.stok_hareketler set vakit = vakit where id in (
  select distinct on (urun_id) id from public.stok_hareketler order by urun_id, tarih desc);

-- ─── İrsaliye / yoldaki mal ─────────────────────────────────────────────────
alter table public.stok_fatura_kalemleri
  add column if not exists belge_id uuid,
  add column if not exists beklenen_tarih date,
  add column if not exists teslim_miktar numeric,
  add column if not exists teslim_tarihi date;
alter table public.stok_fatura_kalemleri
  drop constraint if exists stok_fatura_kalemleri_durum_kontrol,
  add constraint stok_fatura_kalemleri_durum_kontrol check (durum in ('bekliyor', 'teslim', 'iptal'));
create index if not exists stok_fatura_kalemleri_durum_idx on public.stok_fatura_kalemleri (durum, urun_id);

create or replace function public.irsaliye_teslim_al(p_kalemler jsonb, p_tarih date)
returns int language plpgsql security invoker set search_path = public as $$
declare x jsonb; k public.stok_fatura_kalemleri%rowtype; v_gelen numeric; v_hareket uuid; n int := 0;
begin
  if not public.kebo_kullanici() then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_kalemler) loop
    select * into k from public.stok_fatura_kalemleri where id = (x ->> 'id')::uuid and durum = 'bekliyor' for update;
    if not found then continue; end if;
    v_gelen := coalesce((x ->> 'gelen')::numeric, k.miktar);
    if v_gelen > 0 and k.urun_id is not null then
      insert into public.stok_hareketler (urun_id, tarih, tip, miktar, birim_fiyat, kaynak, fatura_id, aciklama, kullanici)
      values (k.urun_id, p_tarih, 'giris', v_gelen, k.birim_fiyat, 'irsaliye', k.belge_id,
              concat_ws(' · ', 'İrsaliye', nullif(k.fatura_no, ''), nullif(k.tedarikci, '')),
              split_part(auth.jwt() ->> 'email', '@', 1))
      returning id into v_hareket;
      if coalesce(k.birim_fiyat, 0) > 0 then
        update public.stok_urunler set son_fiyat = k.birim_fiyat where id = k.urun_id;
      end if;
    else
      v_hareket := null;
    end if;
    update public.stok_fatura_kalemleri
       set durum = case when v_gelen > 0 then 'teslim' else 'iptal' end,
           teslim_miktar = v_gelen, teslim_tarihi = p_tarih, hareket_id = v_hareket,
           onaylayan = split_part(auth.jwt() ->> 'email', '@', 1), onay_tarihi = now()
     where id = k.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.irsaliye_teslim_al(jsonb, date) from public, anon;
grant execute on function public.irsaliye_teslim_al(jsonb, date) to authenticated;
