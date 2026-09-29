-- ─── KULLANICI BAZLI YETKİLER ────────────────────────────────────────────────
-- Tam Yetkili her şeye erişir. Diğer kullanıcılar (rol 'Müdür') sadece
-- profiles.yetkiler listesindeki alanlara erişir. rol 'Pasif' = giriş yapsa da hiçbir veriye erişemez.

alter table public.profiles add column if not exists yetkiler text[] not null default '{rapor_gir}';

-- Mevcut Müdür(ler) bugünkü erişimini aynen korusun
update public.profiles set yetkiler = '{rapor_gir,stok,recete,personel,puantaj}' where trim(role) = 'Müdür';
update public.profiles set yetkiler = '{}' where trim(role) = 'Tam Yetkili';

create or replace function public.kebo_izin(p_izin text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select trim(role) = 'Tam Yetkili' or (trim(role) = 'Müdür' and p_izin = any(yetkiler))
      from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.kebo_izin(text) from public, anon;
grant execute on function public.kebo_izin(text) to authenticated;

-- Rol + yetkileri JWT app_metadata'ya kopyala (proxy her istekte sorgu atmasın)
create or replace function public.kebo_rol_senkron()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', trim(new.role), 'yetkiler', to_jsonb(coalesce(new.yetkiler, '{}')))
   where id = new.id;
  return new;
end $$;
drop trigger if exists trg_kebo_rol_senkron on public.profiles;
create trigger trg_kebo_rol_senkron after insert or update of role, id, yetkiler on public.profiles
  for each row execute function public.kebo_rol_senkron();
update public.profiles set yetkiler = yetkiler;  -- mevcutları senkronla

-- Yetkileri sadece Tam Yetkili değiştirir; kendini düşüremez.
create or replace function public.kullanici_yetki_guncelle(p_id uuid, p_rol text, p_yetkiler text[], p_ad text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  gecerli text[] := array['anasayfa','rapor_gir','rapor_duzenle','rapor_analiz','kasa','cari','kar_zarar',
                          'stok','recete','personel','personel_hassas','puantaj','puantaj_duzenle','yonetim'];
begin
  if not public.kebo_tam_yetkili() then
    raise exception 'Yetkileri sadece Tam Yetkili kullanıcılar değiştirebilir.' using errcode = '42501';
  end if;
  if p_rol not in ('Tam Yetkili', 'Müdür', 'Pasif') then raise exception 'Geçersiz rol: %', p_rol; end if;
  if p_id = auth.uid() and p_rol <> 'Tam Yetkili' then
    raise exception 'Kendi Tam Yetkili rolünüzü kaldıramazsınız.';
  end if;
  if exists (select 1 from unnest(coalesce(p_yetkiler, '{}')) y where y <> all(gecerli)) then
    raise exception 'Geçersiz yetki anahtarı.';
  end if;
  update public.profiles
     set role = p_rol,
         yetkiler = coalesce((select array_agg(distinct y order by y) from unnest(p_yetkiler) y), '{}'),
         full_name = coalesce(nullif(trim(p_ad), ''), full_name)
   where id = p_id;
  if not found then raise exception 'Kullanıcı bulunamadı.'; end if;
end $$;
revoke all on function public.kullanici_yetki_guncelle(uuid, text, text[], text) from public, anon;
grant execute on function public.kullanici_yetki_guncelle(uuid, text, text[], text) to authenticated;

-- Rapor düzenleme: "rapor_duzenle" yetkisi
create or replace function public.talep_onayla(p_talep_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.rapor_degisiklik_talepleri%rowtype;
begin
  if not public.kebo_izin('rapor_duzenle') then
    raise exception 'Talepleri onaylama yetkiniz yok.' using errcode = '42501';
  end if;
  select * into t from public.rapor_degisiklik_talepleri where id = p_talep_id and durum = 'bekliyor' for update;
  if not found then raise exception 'Talep bulunamadı ya da zaten işlenmiş.'; end if;
  perform public.rapor_kaydet(t.yeni_veri, t.rapor_id);
  update public.rapor_degisiklik_talepleri
     set durum = 'onaylandi', onaylayan = auth.jwt() ->> 'email', onay_tarihi = now()
   where id = p_talep_id;
end $$;

-- rapor_kaydet: sadece yetki satırlarını değiştir
do $$
declare d text;
begin
  select pg_get_functiondef('public.rapor_kaydet(jsonb, uuid)'::regprocedure) into d;
  d := replace(d, $x$if p_rapor_id is not null and v_rol <> 'Tam Yetkili' then$x$,
                  $x$if p_rapor_id is not null and not public.kebo_izin('rapor_duzenle') then$x$);
  d := replace(d, $x$Mevcut raporları sadece Tam Yetkili kullanıcılar değiştirebilir$x$,
                  $x$Mevcut raporları değiştirme yetkiniz yok$x$);
  if d not like '%kebo_izin(''rapor_duzenle'')%' then raise exception 'rapor_kaydet güncellenemedi'; end if;
  execute d;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- gunluk_raporlar: güncelle/sil → rapor_duzenle
drop policy if exists kebo_guncelleme on public.gunluk_raporlar;
drop policy if exists kebo_silme on public.gunluk_raporlar;
create policy kebo_guncelleme on public.gunluk_raporlar for update to authenticated
  using ((select public.kebo_izin('rapor_duzenle'))) with check ((select public.kebo_izin('rapor_duzenle')));
create policy kebo_silme on public.gunluk_raporlar for delete to authenticated
  using ((select public.kebo_izin('rapor_duzenle')));

drop policy if exists kebo_guncelleme on public.rapor_degisiklik_talepleri;
drop policy if exists kebo_okuma on public.rapor_degisiklik_talepleri;
drop policy if exists kebo_silme on public.rapor_degisiklik_talepleri;
create policy kebo_okuma on public.rapor_degisiklik_talepleri for select to authenticated
  using ((select public.kebo_izin('rapor_duzenle')) or talep_eden = ((select auth.jwt()) ->> 'email'));
create policy kebo_guncelleme on public.rapor_degisiklik_talepleri for update to authenticated
  using ((select public.kebo_izin('rapor_duzenle'))) with check ((select public.kebo_izin('rapor_duzenle')));
create policy kebo_silme on public.rapor_degisiklik_talepleri for delete to authenticated
  using ((select public.kebo_izin('rapor_duzenle')));

-- kasa_manuel_islemler: okuma kasa/kâr-zarar/rapor analizi/anasayfa, yazma kasa
drop policy if exists kebo_tam_yetkili_tum on public.kasa_manuel_islemler;
create policy kebo_okuma on public.kasa_manuel_islemler for select to authenticated
  using ((select public.kebo_izin('kasa')) or (select public.kebo_izin('kar_zarar'))
      or (select public.kebo_izin('rapor_analiz')) or (select public.kebo_izin('anasayfa')));
create policy kebo_yazma on public.kasa_manuel_islemler for insert to authenticated with check ((select public.kebo_izin('kasa')));
create policy kebo_guncelleme on public.kasa_manuel_islemler for update to authenticated
  using ((select public.kebo_izin('kasa'))) with check ((select public.kebo_izin('kasa')));
create policy kebo_silme on public.kasa_manuel_islemler for delete to authenticated using ((select public.kebo_izin('kasa')));

-- sabit_giderler: okuma kasa/anasayfa/kâr-zarar, yazma kasa
drop policy if exists kebo_tam_yetkili_tum on public.sabit_giderler;
create policy kebo_okuma on public.sabit_giderler for select to authenticated
  using ((select public.kebo_izin('kasa')) or (select public.kebo_izin('anasayfa')) or (select public.kebo_izin('kar_zarar')));
create policy kebo_yazma on public.sabit_giderler for all to authenticated
  using ((select public.kebo_izin('kasa'))) with check ((select public.kebo_izin('kasa')));

-- faturalar ve cari_odemeler: okuma cari/kâr-zarar/anasayfa, yazma cari
drop policy if exists kebo_tam_yetkili_tum on public.faturalar;
create policy kebo_okuma on public.faturalar for select to authenticated
  using ((select public.kebo_izin('cari')) or (select public.kebo_izin('kar_zarar')) or (select public.kebo_izin('anasayfa')));
create policy kebo_yazma on public.faturalar for all to authenticated
  using ((select public.kebo_izin('cari'))) with check ((select public.kebo_izin('cari')));

drop policy if exists kebo_tam_yetkili_tum on public.cari_odemeler;
create policy kebo_okuma on public.cari_odemeler for select to authenticated
  using ((select public.kebo_izin('cari')) or (select public.kebo_izin('kar_zarar')) or (select public.kebo_izin('anasayfa')));
create policy kebo_yazma on public.cari_odemeler for all to authenticated
  using ((select public.kebo_izin('cari'))) with check ((select public.kebo_izin('cari')));

-- cariler: okuma herkes (irsaliyede cari seçimi), yazma cari
drop policy if exists kebo_ekleme on public.cariler;
drop policy if exists kebo_guncelleme on public.cariler;
drop policy if exists kebo_silme on public.cariler;
create policy kebo_ekleme on public.cariler for insert to authenticated with check ((select public.kebo_izin('cari')));
create policy kebo_guncelleme on public.cariler for update to authenticated
  using ((select public.kebo_izin('cari'))) with check ((select public.kebo_izin('cari')));
create policy kebo_silme on public.cariler for delete to authenticated using ((select public.kebo_izin('cari')));

-- personel_hassas: TC/IBAN
drop policy if exists kebo_tam_yetkili_tum on public.personel_hassas;
create policy kebo_hassas on public.personel_hassas for all to authenticated
  using ((select public.kebo_izin('personel_hassas'))) with check ((select public.kebo_izin('personel_hassas')));

-- Yönetim: işlem geçmişi, hata kayıtları, sorun bildirimleri
drop policy if exists kebo_okuma on public.islem_gecmisi;
create policy kebo_okuma on public.islem_gecmisi for select to authenticated using ((select public.kebo_izin('yonetim')));
drop policy if exists kebo_okuma on public.hata_kayitlari;
create policy kebo_okuma on public.hata_kayitlari for select to authenticated using ((select public.kebo_izin('yonetim')));
drop policy if exists kebo_yonetim on public.geri_bildirim;
drop policy if exists kebo_guncelleme on public.geri_bildirim;
create policy kebo_yonetim on public.geri_bildirim for select to authenticated using ((select public.kebo_izin('yonetim')));
create policy kebo_guncelleme on public.geri_bildirim for update to authenticated
  using ((select public.kebo_izin('yonetim'))) with check ((select public.kebo_izin('yonetim')));
drop policy if exists "geri bildirim okuma" on storage.objects;
create policy "geri bildirim okuma" on storage.objects for select to authenticated
  using (bucket_id = 'geri-bildirim' and (select public.kebo_izin('yonetim')));
