-- REÇETE DÜZENİ (31.10.2026)
-- • recete_urunleri: menü ürünü / ara reçete bilgisi (tür, verim, grup, elle satış fiyatı, not)
-- • receteler: satır kendi biriminde (g, kg, ml, lt, adet) girilir; satır bir stok ürününe,
--   bir ara reçeteye ya da stokta olmayan bir malzemeye (sadece ad, maliyetsiz) bağlanır.
--   birim boş olan eski satırlar stok ürününün biriminde sayılır.
-- • stok_urunler.adet_gram: kg ile tutulan ürünün 1 adedi kaç gram (nugget, soğan halkası…)

create table if not exists recete_urunleri (
  ad text primary key,
  tur text not null default 'menu' check (tur in ('menu', 'ara')),
  verim_miktar numeric not null default 1 check (verim_miktar > 0),
  verim_birim text not null default 'adet' check (verim_birim in ('adet', 'kg', 'lt')),
  satis_fiyati numeric check (satis_fiyati is null or satis_fiyati >= 0),
  grup text,
  notlar text,
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table recete_urunleri enable row level security;
drop policy if exists kebo_kullanici_tum on recete_urunleri;
create policy kebo_kullanici_tum on recete_urunleri for all to authenticated
  using ((select kebo_kullanici())) with check ((select kebo_kullanici()));

alter table receteler alter column stok_urun_id drop not null;
-- Aynı malzeme bir reçetede iki satır olabilir (ör. "Ekmek sosu" ve "Sos" ikisi de domates sosu)
alter table receteler drop constraint if exists receteler_menu_urun_stok_urun_id_key;
alter table receteler add column if not exists birim text;
alter table receteler add column if not exists etiket text;
alter table receteler add column if not exists ara_recete text references recete_urunleri(ad) on update cascade on delete restrict;
alter table receteler add column if not exists malzeme_adi text;
alter table receteler add column if not exists notlar text;
alter table receteler add column if not exists sira integer not null default 0;
alter table receteler drop constraint if exists receteler_birim_kontrol;
alter table receteler add constraint receteler_birim_kontrol check (birim is null or birim in ('g', 'kg', 'ml', 'lt', 'adet'));
alter table receteler drop constraint if exists receteler_kaynak_kontrol;
alter table receteler add constraint receteler_kaynak_kontrol check (
  num_nonnulls(stok_urun_id, ara_recete, nullif(btrim(coalesce(malzeme_adi, '')), '')) = 1);
alter table receteler drop constraint if exists receteler_miktar_kontrol;
alter table receteler add constraint receteler_miktar_kontrol check (miktar > 0);
create index if not exists receteler_menu_idx on receteler (menu_urun);

alter table stok_urunler add column if not exists adet_gram numeric;
alter table stok_urunler drop constraint if exists stok_urunler_adet_gram_kontrol;
alter table stok_urunler add constraint stok_urunler_adet_gram_kontrol check (adet_gram is null or adet_gram > 0);
