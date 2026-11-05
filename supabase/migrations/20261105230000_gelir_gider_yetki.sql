-- 05.11.2026: Gelir Gider defteri için ayrı yetki 'gelir_gider' (Kasa yetkisinden bağımsız).
-- Geçerli yetki listelerine eklenir (kullanici_yetki_guncelle, kullanici_olustur, tg_kim), tablo kuralı bu yetkiye bağlanır.
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('kullanici_yetki_guncelle', 'kullanici_olustur', 'tg_kim') loop
    d := pg_get_functiondef(r.oid);
    if position('''gelir_gider''' in d) = 0 then
      d := replace(d, '''magicpay'']', '''magicpay'',''gelir_gider'']');
      execute d;
    end if;
  end loop;
end $$;

drop policy if exists kebo_okuma on public.gelir_gider;
drop policy if exists kebo_yazma on public.gelir_gider;
create policy kebo_okuma on public.gelir_gider for select to authenticated using ((select public.kebo_izin('gelir_gider')));
create policy kebo_yazma on public.gelir_gider for all to authenticated
  using ((select public.kebo_izin('gelir_gider'))) with check ((select public.kebo_izin('gelir_gider')));
