-- 29.10.2026: Dükkân robotu Roket Paket Raporu'nu her gün kendisi indirip panele gönderir.
-- Robot, Mikro robotuyla aynı anahtarı kullanır (vault: mikro_pc_anahtar). Excel robotta okunur;
-- panele sadece günlük kurye özetleri gelir (müşteri adı / telefon / adres gelmez).

-- Robotun sabit kurye atamalarını korumak için: o günlerin mevcut kaydı + aralıktan önceki son gün
create or replace function public.roket_pc_atamalar(p_anahtar text, p_bas date, p_bit date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  return jsonb_build_object(
    'mevcut', coalesce((select jsonb_object_agg(tarih::text, veri) from public.roket_gunluk where tarih between p_bas and p_bit), '{}'::jsonb),
    'onceki', (select veri from public.roket_gunluk where tarih < p_bas order by tarih desc limit 1));
end $$;
revoke all on function public.roket_pc_atamalar(text, date, date) from public;
grant execute on function public.roket_pc_atamalar(text, date, date) to anon, authenticated;

create or replace function public.roket_pc_yukle(p_anahtar text, p_gunler jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare g jsonb; n integer := 0;
begin
  if not public._mikro_pc_anahtar_dogru(p_anahtar) then raise exception 'Yetkisiz işlem' using errcode = '42501'; end if;
  if jsonb_typeof(p_gunler) <> 'array' or jsonb_array_length(p_gunler) > 62 then raise exception 'Geçersiz veri'; end if;
  for g in select * from jsonb_array_elements(p_gunler) loop
    if (g ->> 'tarih') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(g -> 'kuryeler') <> 'array' then raise exception 'Geçersiz gün'; end if;
    insert into public.roket_gunluk (tarih, veri, yukleyen, yuklendi)
    values ((g ->> 'tarih')::date, g, 'dükkân robotu', now())
    on conflict (tarih) do update set veri = excluded.veri, yukleyen = excluded.yukleyen, yuklendi = excluded.yuklendi;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.roket_pc_yukle(text, jsonb) from public;
grant execute on function public.roket_pc_yukle(text, jsonb) to anon, authenticated;
