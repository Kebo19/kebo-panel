-- ════════════════════════════════════════════════════════════════════════════
-- KEBO Panel — güvenlik ve veri bütünlüğü düzeltmeleri (25.09.2026)
-- Uygulamadan önce tüm tablolar yedek_20260925 şemasına kopyalandı.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. PROFİLLER: kullanıcılarla eşleştir, rolleri temizle ─────────────────
-- Profil id'leri auth.users id'leriyle eşleşmiyordu; e-postaya göre eşitle.
update public.profiles p
   set id = u.id
  from auth.users u
 where lower(u.email) = lower(trim(p.email)) and p.id <> u.id;

update public.profiles set role = trim(role), email = lower(trim(email));

alter table public.profiles
  drop constraint if exists profiles_role_kontrol,
  add constraint profiles_role_kontrol check (role in ('Tam Yetkili', 'Müdür'));

-- Düz metin şifre kolonları kullanılmıyordu ve güvenlik riskiydi.
alter table public.profiles drop column if exists password;
alter table public.personeller drop column if exists password;

-- ─── 2. ROL FONKSİYONLARI ───────────────────────────────────────────────────
create or replace function public.kebo_rol()
returns text language sql stable security definer set search_path = public as $$
  select trim(role) from public.profiles where id = auth.uid()
$$;

create or replace function public.kebo_kullanici()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.kebo_rol() in ('Tam Yetkili', 'Müdür'), false)
$$;

create or replace function public.kebo_tam_yetkili()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.kebo_rol() = 'Tam Yetkili', false)
$$;

-- profiles.role → auth.users.app_metadata.rol (sayfa yönlendirmesi ek sorgusuz okuyabilsin)
create or replace function public.kebo_rol_senkron()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', trim(new.role))
   where id = new.id;
  return new;
end $$;

drop trigger if exists trg_kebo_rol_senkron on public.profiles;
create trigger trg_kebo_rol_senkron
  after insert or update of role, id on public.profiles
  for each row execute function public.kebo_rol_senkron();

-- Mevcut kullanıcılar için bir kez çalıştır.
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', p.role)
  from public.profiles p
 where p.id = u.id;

-- ─── 3. KULLANILMAYAN TABLOLAR ──────────────────────────────────────────────
-- Platform Takip modülü kaldırıldı (25.09.2026 kararı). Veriler yedekte duruyor.
drop table if exists public.platform_tahsilatlar;
drop table if exists public.kasa_hareketleri;
-- Eski / hiç kullanılmayan tablolar
drop table if exists public.rapor_duzenleme_talepleri;
drop table if exists public.daily_reports;
drop table if exists public.cash_records;
drop table if exists public.report_online;
drop table if exists public.report_expenses;
drop table if exists public.report_couriers;
drop table if exists public.branches;

-- ─── 4. ŞEMA DEĞİŞİKLİKLERİ ─────────────────────────────────────────────────
-- Aynı güne iki rapor girilmesin.
alter table public.gunluk_raporlar
  drop constraint if exists gunluk_raporlar_tarih_benzersiz,
  add constraint gunluk_raporlar_tarih_benzersiz unique (tarih);

-- Rapordan otomatik oluşan kayıtlar rapora bağlanır; rapor silinince onlar da silinir.
alter table public.avanslar
  add column if not exists rapor_id uuid references public.gunluk_raporlar(id) on delete cascade;
alter table public.kesintiler
  add column if not exists rapor_id uuid references public.gunluk_raporlar(id) on delete cascade;

-- Cari ödemeleri: hangi hesaptan ödendiği ve hangi faturaları kapattığı.
--   hesap NULL        → eski kayıt / günlük rapor gideri (Kasa'ya ayrıca yansımaz)
--   fatura_idleri NULL → eski kayıt (bağlantı bilinmiyor)
--   fatura_idleri '{}' → faturaya bağlanmamış ödeme (cari borcundan düşülür)
alter table public.cari_odemeler
  add column if not exists hesap text,
  add column if not exists fatura_idleri uuid[],
  add column if not exists rapor_id uuid references public.gunluk_raporlar(id) on delete cascade;

-- Kasa hareketinin başka bir kayıttan otomatik oluştuğunu işaretler.
alter table public.kasa_manuel_islemler
  add column if not exists kaynak text,
  add column if not exists kaynak_id uuid;
create index if not exists kasa_manuel_islemler_kaynak_idx on public.kasa_manuel_islemler (kaynak, kaynak_id);

-- Geçmiş raporlarda toplam_ciro üç farklı formülle kaydedilmişti; tek formüle getir.
-- 13.08.2026 öncesi: kapıda ödeme kasa sayımının içinde → brüt = online + kasa + gider.
update public.gunluk_raporlar
   set toplam_ciro = coalesce(os_yemeksepeti,0) + coalesce(os_getir,0) + coalesce(os_trendyol,0)
                   + coalesce(os_migros,0) + coalesce(os_chicknfride,0)
                   + coalesce(kasa_nakit,0) + coalesce(kasa_pos,0) + coalesce(kasa_edenred,0) + coalesce(kasa_metropol,0)
                   + coalesce(gunluk_gider,0)
 where tarih < '2026-08-13'
   and coalesce(os_kebo_ys,0) + coalesce(os_kebo_trendyol,0) + coalesce(os_kebo_migros,0)
     + coalesce(os_cnf_ys,0) + coalesce(os_cnf_trendyol,0) + coalesce(os_cnf_migros_yemek,0)
     + coalesce(ko_kebo_ys,0) + coalesce(ko_kebo_trendyol,0) + coalesce(ko_kebo_migros_yemek,0) + coalesce(ko_kebo_alo,0)
     + coalesce(ko_cnf_ys,0) + coalesce(ko_cnf_trendyol,0) + coalesce(ko_cnf_migros_yemek,0) + coalesce(ko_cnf_alo,0) = 0;

-- ─── 5. KASA BAĞLANTILARI (trigger) ─────────────────────────────────────────
-- Personel avansı ve cari ödemesi bir hesaptan (Nakit/TEB/VakıfBank/Enpara)
-- yapıldığında Kasa'ya otomatik gider hareketi yazılır; kayıt silinir/değişirse
-- hareket de güncellenir.
create or replace function public.kebo_kasa_ayna()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kaynak text := case tg_table_name when 'avanslar' then 'avans' else 'cari_odeme' end;
  v_hesap text; v_kategori text; v_aciklama text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.kasa_manuel_islemler where kaynak = v_kaynak and kaynak_id = old.id;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if tg_table_name = 'avanslar' then
    v_hesap := new.kasa_kaynagi;
    v_kategori := 'Personel Avans';
    v_aciklama := concat_ws(' — ', new.personel_isim, nullif(new.aciklama, ''));
    if new.rapor_id is not null then v_hesap := null; end if; -- rapor giderine zaten dahil
  else
    v_hesap := new.hesap;
    v_kategori := 'Cari Ödeme';
    v_aciklama := concat_ws(' — ', new.cari_unvan, nullif(new.aciklama, ''));
  end if;

  if v_hesap in ('Nakit', 'TEB', 'VakıfBank', 'Enpara') and coalesce(new.tutar, 0) > 0 then
    insert into public.kasa_manuel_islemler
      (tip, hesap, kategori, tutar, aciklama, islem_tarihi, ekleyen_kullanici, kaynak, kaynak_id)
    values
      ('gider', v_hesap, v_kategori, new.tutar, v_aciklama, new.tarih,
       coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'otomatik'), v_kaynak, new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_kasa_ayna on public.avanslar;
create trigger trg_kasa_ayna after insert or update or delete on public.avanslar
  for each row execute function public.kebo_kasa_ayna();
drop trigger if exists trg_kasa_ayna on public.cari_odemeler;
create trigger trg_kasa_ayna after insert or update or delete on public.cari_odemeler
  for each row execute function public.kebo_kasa_ayna();

-- ─── 6. STOK TRIGGER DÜZELTMESİ ─────────────────────────────────────────────
-- Eski sürüm DELETE'te NEW boş olduğu için stoğu güncellemiyordu ve "çıkış"
-- hareketlerini düşmüyordu.
create or replace function public.update_mevcut_stok()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_urun uuid;
  v_son_sayim numeric; v_sayim_tarihi date; v_sayim_zamani timestamptz;
  v_fark numeric;
begin
  foreach v_urun in array array_remove(array[
      case when tg_op <> 'INSERT' then old.urun_id end,
      case when tg_op <> 'DELETE' then new.urun_id end], null)
  loop
    select miktar, tarih, created_at into v_son_sayim, v_sayim_tarihi, v_sayim_zamani
      from public.stok_hareketler
     where urun_id = v_urun and tip = 'sayim'
     order by tarih desc, created_at desc limit 1;

    select coalesce(sum(case tip when 'giris' then miktar when 'cikis' then -miktar when 'duzeltme' then miktar else 0 end), 0)
      into v_fark
      from public.stok_hareketler
     where urun_id = v_urun and tip <> 'sayim'
       and (v_sayim_tarihi is null or tarih > v_sayim_tarihi
            or (tarih = v_sayim_tarihi and created_at > v_sayim_zamani));

    update public.stok_urunler
       set mevcut_stok = coalesce(v_son_sayim, 0) + v_fark, updated_at = now()
     where id = v_urun;
  end loop;
  return coalesce(new, old);
end $$;

alter function public.stok_kullanim_hesapla(uuid, date, date) set search_path = public;

-- ─── 7. RAPOR KAYDETME (atomik) ─────────────────────────────────────────────
-- Rapor + rapordan doğan avans/kesinti/firma ödemeleri tek transaction'da
-- kaydedilir; biri hata verirse hiçbiri kaydedilmez.
--   p_veri: gunluk_raporlar kolonları + isteğe bağlı "_ekler":
--     { "avanslar":  [{personel_id, personel_isim, tutar, aciklama}],
--       "kesintiler":[{personel_id, personel_isim, tutar, aciklama}],
--       "firma_odemeleri": [{cari_id, cari_unvan, tutar, aciklama}] }
--   p_rapor_id: NULL → yeni rapor, dolu → mevcut raporu güncelle (sadece Tam Yetkili)
create or replace function public.rapor_kaydet(p_veri jsonb, p_rapor_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.kebo_rol();
  v_ekler jsonb := coalesce(p_veri -> '_ekler', '{}'::jsonb);
  v_rapor jsonb := p_veri - '_ekler' - 'id' - 'created_at';
  v_id uuid; v_tarih date; v_set text;
begin
  if v_rol is null or v_rol not in ('Tam Yetkili', 'Müdür') then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  if p_rapor_id is not null and v_rol <> 'Tam Yetkili' then
    raise exception 'Mevcut raporları sadece Tam Yetkili kullanıcılar değiştirebilir; değişiklik talebi gönderin.' using errcode = '42501';
  end if;

  v_tarih := coalesce((v_rapor ->> 'tarih')::date,
                      (select tarih from public.gunluk_raporlar where id = p_rapor_id));
  if v_tarih is null then raise exception 'Rapor tarihi eksik.'; end if;

  if p_rapor_id is null then
    insert into public.gunluk_raporlar (tarih, ekleyen_kullanici)
    values (v_tarih, coalesce(nullif(v_rapor ->> 'ekleyen_kullanici', ''), split_part(auth.jwt() ->> 'email', '@', 1), 'Bilinmiyor'))
    returning id into v_id;
  else
    v_id := p_rapor_id;
    if not exists (select 1 from public.gunluk_raporlar where id = v_id) then
      raise exception 'Rapor bulunamadı.';
    end if;
  end if;

  select string_agg(format('%1$I = (jsonb_populate_record(g, $1)).%1$I', c.column_name), ', ')
    into v_set
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'gunluk_raporlar'
     and c.column_name not in ('id', 'created_at') and v_rapor ? c.column_name;
  if v_set is not null then
    execute format('update public.gunluk_raporlar g set %s where g.id = $2', v_set) using v_rapor, v_id;
  end if;

  if v_ekler ? 'avanslar' then
    delete from public.avanslar where rapor_id = v_id;
    insert into public.avanslar (personel_id, personel_isim, tutar, tarih, odeme_yontemi, kasa_kaynagi, aciklama, rapor_id)
    select nullif(x ->> 'personel_id', ''), x ->> 'personel_isim', (x ->> 'tutar')::numeric, v_tarih,
           'Ürün / Fiş (Kasa Gideri)', null, nullif(x ->> 'aciklama', ''), v_id
      from jsonb_array_elements(v_ekler -> 'avanslar') x
     where coalesce((x ->> 'tutar')::numeric, 0) > 0;
  end if;

  if v_ekler ? 'kesintiler' then
    delete from public.kesintiler where rapor_id = v_id;
    insert into public.kesintiler (personel_id, personel_isim, tutar, tarih, aciklama, rapor_id)
    select nullif(x ->> 'personel_id', ''), x ->> 'personel_isim', (x ->> 'tutar')::numeric, v_tarih,
           nullif(x ->> 'aciklama', ''), v_id
      from jsonb_array_elements(v_ekler -> 'kesintiler') x
     where coalesce((x ->> 'tutar')::numeric, 0) > 0;
  end if;

  if v_ekler ? 'firma_odemeleri' then
    delete from public.cari_odemeler where rapor_id = v_id;
    insert into public.cari_odemeler (cari_id, cari_unvan, tutar, tarih, odeme_yontemi, aciklama, hesap, fatura_idleri, rapor_id)
    select nullif(x ->> 'cari_id', '')::uuid, x ->> 'cari_unvan', (x ->> 'tutar')::numeric, v_tarih,
           'Kasa (Günlük Rapor)', coalesce(nullif(x ->> 'aciklama', ''), 'Günlük rapor gideri'), null, '{}'::uuid[], v_id
      from jsonb_array_elements(v_ekler -> 'firma_odemeleri') x
     where coalesce((x ->> 'tutar')::numeric, 0) > 0 and nullif(x ->> 'cari_id', '') is not null;
  end if;

  return v_id;
end $$;

-- Müdürün değişiklik talebini Tam Yetkili onaylar; rapor ve bağlı kayıtlar birlikte güncellenir.
create or replace function public.talep_onayla(p_talep_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.rapor_degisiklik_talepleri%rowtype;
begin
  if not public.kebo_tam_yetkili() then
    raise exception 'Talepleri sadece Tam Yetkili kullanıcılar onaylayabilir.' using errcode = '42501';
  end if;
  select * into t from public.rapor_degisiklik_talepleri where id = p_talep_id and durum = 'bekliyor' for update;
  if not found then raise exception 'Talep bulunamadı ya da zaten işlenmiş.'; end if;
  perform public.rapor_kaydet(t.yeni_veri, t.rapor_id);
  update public.rapor_degisiklik_talepleri
     set durum = 'onaylandi', onaylayan = auth.jwt() ->> 'email', onay_tarihi = now()
   where id = p_talep_id;
end $$;

revoke all on function public.rapor_kaydet(jsonb, uuid) from public, anon;
revoke all on function public.talep_onayla(uuid) from public, anon;
grant execute on function public.rapor_kaydet(jsonb, uuid) to authenticated;
grant execute on function public.talep_onayla(uuid) to authenticated;

-- ─── 8. RLS KURALLARI ───────────────────────────────────────────────────────
-- Giriş yapmamış (anon) kimse hiçbir tabloya erişemez.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- Herkese (Tam Yetkili + Müdür) tam erişim: stok ve personel işleri
do $$
declare t text;
begin
  foreach t in array array['stok_urunler','stok_hareketler','stok_kategoriler','stok_fatura_kalemleri',
                           'avanslar','kesintiler','primler'] loop
    execute format('create policy kebo_kullanici_tum on public.%I for all to authenticated using (public.kebo_kullanici()) with check (public.kebo_kullanici())', t);
  end loop;
  -- Sadece Tam Yetkili: finans
  foreach t in array array['faturalar','cari_odemeler','kasa_manuel_islemler'] loop
    execute format('create policy kebo_tam_yetkili_tum on public.%I for all to authenticated using (public.kebo_tam_yetkili()) with check (public.kebo_tam_yetkili())', t);
  end loop;
end $$;

-- Personel: herkes görür/ekler/düzenler, sadece Tam Yetkili siler.
create policy kebo_okuma on public.personeller for select to authenticated using (public.kebo_kullanici());
create policy kebo_ekleme on public.personeller for insert to authenticated with check (public.kebo_kullanici());
create policy kebo_guncelleme on public.personeller for update to authenticated using (public.kebo_kullanici()) with check (public.kebo_kullanici());
create policy kebo_silme on public.personeller for delete to authenticated using (public.kebo_tam_yetkili());

-- Cariler: rapordaki "Firma" gideri için herkes okur; değişiklik Tam Yetkili.
create policy kebo_okuma on public.cariler for select to authenticated using (public.kebo_kullanici());
create policy kebo_yazma on public.cariler for all to authenticated using (public.kebo_tam_yetkili()) with check (public.kebo_tam_yetkili());

-- Günlük raporlar: herkes okur ve yeni rapor ekler; değiştirme/silme Tam Yetkili.
-- (Yeni kod kaydı rapor_kaydet fonksiyonuyla yapar; insert kuralı geçiş için duruyor.)
create policy kebo_okuma on public.gunluk_raporlar for select to authenticated using (public.kebo_kullanici());
create policy kebo_ekleme on public.gunluk_raporlar for insert to authenticated with check (public.kebo_kullanici());
create policy kebo_guncelleme on public.gunluk_raporlar for update to authenticated using (public.kebo_tam_yetkili()) with check (public.kebo_tam_yetkili());
create policy kebo_silme on public.gunluk_raporlar for delete to authenticated using (public.kebo_tam_yetkili());

-- Değişiklik talepleri: Müdür kendi talebini görür ve oluşturur; onay/ret Tam Yetkili.
create policy kebo_okuma on public.rapor_degisiklik_talepleri for select to authenticated
  using (public.kebo_tam_yetkili() or talep_eden = auth.jwt() ->> 'email');
create policy kebo_ekleme on public.rapor_degisiklik_talepleri for insert to authenticated
  with check (public.kebo_kullanici() and talep_eden = auth.jwt() ->> 'email' and durum = 'bekliyor');
create policy kebo_guncelleme on public.rapor_degisiklik_talepleri for update to authenticated
  using (public.kebo_tam_yetkili()) with check (public.kebo_tam_yetkili());
create policy kebo_silme on public.rapor_degisiklik_talepleri for delete to authenticated using (public.kebo_tam_yetkili());

-- Profiller: herkes kendi satırını, Tam Yetkili hepsini okur. Değişiklik sadece Supabase panelinden.
create policy kebo_okuma on public.profiles for select to authenticated
  using (id = auth.uid() or public.kebo_tam_yetkili());

-- Yedek şeması API'den erişilemez.
revoke all on schema yedek_20260925 from anon, authenticated;
