-- 28.10.2026: Kişiye özel (kodda id listesiyle tutulan) yetkiler, yetki ekranındaki kutucuklara taşındı.
--   rapor_onay  : Kasa Raporu düzenlemelerini onaylama, raporu doğrudan düzenleme / silme (eskiden Murat, Bülent)
--   stok_deger  : Stok değeri + Fiyat Listesi + Mikro fatura aktarımı (eskiden stok_deger_izinli tablosu)
--   magicpay    : MagicPay karşılaştırma ekranı (sadece uygulama tarafında kontrol edilir)
-- Tam Yetkili hepsine sahiptir (kebo_izin). Bugün Murat ve Bülent Tam Yetkili olduğu için davranış değişmez.

create or replace function public.kebo_rapor_onaycisi()
returns boolean language sql stable security definer set search_path = public as $$
  select public.kebo_izin('rapor_onay')
$$;

create or replace function public.stok_deger_yetkili()
returns boolean language sql stable security definer set search_path = public as $$
  select public.kebo_izin('stok_deger')
$$;

-- Geçerli yetki listesi (kullanici_yetki_guncelle + kullanici_olustur)
do $$
declare f text; d text; y text;
begin
  foreach f in array array['public.kullanici_yetki_guncelle(uuid, text, text[], text)', 'public.kullanici_olustur(text, text, text, text, text[])'] loop
    select pg_get_functiondef(f::regprocedure) into d;
    if position('''rapor_onay''' in d) > 0 then continue; end if;
    y := replace(d, $a$'puantaj','puantaj_duzenle','yonetim'];$a$,
                    $b$'puantaj','puantaj_duzenle','yonetim','rapor_onay','stok_deger','magicpay'];$b$);
    if y = d then raise exception '% beklenen biçimde değil', f; end if;
    execute y;
  end loop;
end $$;

-- Telegram: kullanıcının yetkileri ve onaycı bilgisi de yetki kutucuklarından
do $$
declare d text; y text;
begin
  select pg_get_functiondef('public.tg_kim(text, bigint)'::regprocedure) into d;
  if position('rapor_onay' in d) > 0 then return; end if;
  y := replace(d, $a$'kar_zarar','stok','recete','personel','puantaj','yonetim']$a$,
                  $b$'kar_zarar','stok','recete','personel','puantaj','yonetim','rapor_onay','stok_deger','magicpay']$b$);
  y := replace(y, $a$'onayci', p.id = any (array['c4d199e9-e0b7-4d33-8ad8-556f7d488bac', 'e75d458f-1c36-405a-bd56-3c590c28cd54']::uuid[]))$a$,
                  $b$'onayci', trim(p.role) = 'Tam Yetkili' or (trim(p.role) = 'Müdür' and 'rapor_onay' = any(coalesce(p.yetkiler, '{}'))))$b$);
  if position('rapor_onay' in y) = 0 or position('c4d199e9' in y) > 0 then raise exception 'tg_kim beklenen biçimde değil'; end if;
  execute y;
end $$;
