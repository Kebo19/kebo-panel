-- Kasa Raporu düzenleme onayı: sadece Murat (murat@kebo.com) ve Bülent (bulent@kebo.com).
--   • Mevcut raporu doğrudan değiştirme / silme ve değişiklik taleplerini onaylama/reddetme
--     sadece bu iki kişide. Diğer herkesin (rapor_duzenle yetkisi olsa da) düzenlemesi talep olur.
--   • Uygulamadaki aynı liste: lib/yetki.ts → RAPOR_ONAYCILARI.

create or replace function public.kebo_rapor_onaycisi()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = any (array['c4d199e9-e0b7-4d33-8ad8-556f7d488bac', 'e75d458f-1c36-405a-bd56-3c590c28cd54']::uuid[])
    and exists (select 1 from public.profiles where id = auth.uid() and trim(role) in ('Tam Yetkili', 'Müdür')),
    false)
$$;
revoke all on function public.kebo_rapor_onaycisi() from public, anon;
grant execute on function public.kebo_rapor_onaycisi() to authenticated;

-- Talep onayı
create or replace function public.talep_onayla(p_talep_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare t public.rapor_degisiklik_talepleri%rowtype;
begin
  if not public.kebo_rapor_onaycisi() then
    raise exception 'Rapor değişikliklerini sadece Murat ve Bülent onaylayabilir.' using errcode = '42501';
  end if;
  select * into t from public.rapor_degisiklik_talepleri where id = p_talep_id and durum = 'bekliyor' for update;
  if not found then raise exception 'Talep bulunamadı ya da zaten işlenmiş.'; end if;
  perform public.rapor_kaydet(t.yeni_veri, t.rapor_id);
  update public.rapor_degisiklik_talepleri
     set durum = 'onaylandi', onaylayan = auth.jwt() ->> 'email', onay_tarihi = now()
   where id = p_talep_id;
end $$;
revoke all on function public.talep_onayla(uuid) from public, anon;
grant execute on function public.talep_onayla(uuid) to authenticated;

-- rapor_kaydet: mevcut raporu güncellemek sadece onaycılara açık (yeni rapor herkese).
do $$
declare d text;
begin
  select pg_get_functiondef('public.rapor_kaydet(jsonb, uuid)'::regprocedure) into d;
  d := replace(d, $x$if p_rapor_id is not null and not public.kebo_izin('rapor_duzenle') then$x$,
                  $x$if p_rapor_id is not null and not public.kebo_rapor_onaycisi() then$x$);
  d := replace(d, 'Mevcut raporları değiştirme yetkiniz yok; değişiklik talebi gönderin.',
                  'Mevcut raporları sadece Murat ve Bülent değiştirebilir; değişiklik talebi gönderin.');
  if d not like '%kebo_rapor_onaycisi()%' then raise exception 'rapor_kaydet güncellenemedi'; end if;
  execute d;
end $$;

-- gunluk_raporlar: güncelle / sil → onaycılar
drop policy if exists kebo_guncelleme on public.gunluk_raporlar;
drop policy if exists kebo_silme on public.gunluk_raporlar;
create policy kebo_guncelleme on public.gunluk_raporlar for update to authenticated
  using ((select public.kebo_rapor_onaycisi())) with check ((select public.kebo_rapor_onaycisi()));
create policy kebo_silme on public.gunluk_raporlar for delete to authenticated
  using ((select public.kebo_rapor_onaycisi()));

-- Değişiklik talepleri: herkes kendi talebini görür/oluşturur; tümünü görme, onay/ret, silme → onaycılar
-- Eski, herkese açık politikalar (izinli politikalar OR'lanır; kalırlarsa herkes talebi reddedebilir/görebilir).
drop policy if exists "Giris yapan ekleyebilir" on public.rapor_degisiklik_talepleri;
drop policy if exists "Giris yapan guncelleyebilir" on public.rapor_degisiklik_talepleri;
drop policy if exists "Herkes okuyabilir" on public.rapor_degisiklik_talepleri;
drop policy if exists kebo_okuma on public.rapor_degisiklik_talepleri;
drop policy if exists kebo_guncelleme on public.rapor_degisiklik_talepleri;
drop policy if exists kebo_silme on public.rapor_degisiklik_talepleri;
create policy kebo_okuma on public.rapor_degisiklik_talepleri for select to authenticated
  using ((select public.kebo_rapor_onaycisi()) or talep_eden = ((select auth.jwt()) ->> 'email'));
create policy kebo_guncelleme on public.rapor_degisiklik_talepleri for update to authenticated
  using ((select public.kebo_rapor_onaycisi())) with check ((select public.kebo_rapor_onaycisi()));
create policy kebo_silme on public.rapor_degisiklik_talepleri for delete to authenticated
  using ((select public.kebo_rapor_onaycisi()));
