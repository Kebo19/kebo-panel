-- Gider ödeme yöntemi (29.10.2026): kasa raporunda her gider satırı Nakit / Geçmiş günlerin nakiti / POS / Diğer.
--  • gunluk_gider       = geçmiş günlerin nakiti hariç bütün giderler (net ciroyu düşürür, eskisi gibi)
--  • gider_nakit_disi   = bunun POS / diğer ile ödenen kısmı → brüt ciroya EKLENMEZ, kasa nakdi kontrolüne girmez
--  • geçmiş günlerin nakiti → nakit kasa çıkışı (kasa_manuel_islemler, kaynak 'rapor_nakit'), gunluk_gider'e girmez
alter table public.gunluk_raporlar add column if not exists gider_nakit_disi numeric not null default 0;

-- MagicPay kasa karşılaştırması: nakit = kasa sayımı + sadece nakit ödenen gider (+ firma)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kasa_magic_hesapla'::regproc);
  if position('gider_nakit_disi' in d) = 0 then
    d := replace(d,
      $r$public.kasa_tutar(p_rapor -> 'kasa_nakit') + public.kasa_tutar(p_rapor -> 'gunluk_gider') + coalesce(p_firma, 0)$r$,
      $r$public.kasa_tutar(p_rapor -> 'kasa_nakit') + public.kasa_tutar(p_rapor -> 'gunluk_gider') - public.kasa_tutar(p_rapor -> 'gider_nakit_disi') + coalesce(p_firma, 0)$r$);
    if position('gider_nakit_disi' in d) = 0 then raise exception 'kasa_magic_hesapla güncellenemedi'; end if;
    execute d;
  end if;
end $$;
