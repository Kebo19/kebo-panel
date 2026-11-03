-- Telegram: fatura mesajındaki "🚫 Bu firmayı hiç sorma" düğmesi.
-- Faturanın tedarikçisini stok takibi dışına alır (stok_takipsiz_tedarikci) ve
-- o firmanın bekleyen bütün stok önerilerini kapatır. Cari kayıtlarına dokunmaz.
create or replace function public.tg_stok_tedarikci_takipsiz(p_anahtar text, p_chat bigint, p_gib text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v uuid := public._tg_kullanici(p_anahtar, p_chat); v_ad text; v_vkn text; v_ted text; n int := 0;
begin
  if v is null or not public._tg_izin(v, 'stok') then raise exception 'Stok yetkiniz yok.' using errcode = '42501'; end if;
  select split_part(email, '@', 1) into v_ad from public.profiles where id = v;
  select min(vkn), min(tedarikci) into v_vkn, v_ted from public.stok_giris_onerileri where gib_no = p_gib;
  if coalesce(trim(v_vkn), '') = '' then raise exception 'Faturanın vergi numarası bulunamadı.'; end if;
  insert into public.stok_takipsiz_tedarikci (vkn, tedarikci, ekleyen) values (v_vkn, v_ted, coalesce(v_ad, 'telegram'))
  on conflict (vkn) do update set tedarikci = coalesce(excluded.tedarikci, stok_takipsiz_tedarikci.tedarikci), ekleyen = excluded.ekleyen, eklendi = now();
  update public.stok_giris_onerileri set durum = 'reddedildi', karar_veren = coalesce(v_ad, 'telegram'), karar_zamani = now()
   where vkn = v_vkn and durum = 'bekliyor';
  get diagnostics n = row_count;
  return jsonb_build_object('tedarikci', v_ted, 'kapanan', n);
end $function$;

revoke all on function public.tg_stok_tedarikci_takipsiz(text, bigint, text) from public;
grant execute on function public.tg_stok_tedarikci_takipsiz(text, bigint, text) to anon, authenticated, service_role;
