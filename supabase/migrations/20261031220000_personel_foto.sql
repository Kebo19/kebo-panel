-- 31.10.2026: Personel fotoğrafı. Telefonda küçültülüp (en fazla 480 px, JPEG) gizli "personel-foto"
-- deposuna yüklenir; yolu personeller.foto_yolu'nda. Sadece personel yetkisi olanlar görür/yükler.
alter table public.personeller add column if not exists foto_yolu text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personel-foto', 'personel-foto', false, 524288, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "personel foto okuma" on storage.objects;
create policy "personel foto okuma" on storage.objects for select to authenticated
  using (bucket_id = 'personel-foto' and (select public.kebo_izin('personel')));
drop policy if exists "personel foto yukleme" on storage.objects;
create policy "personel foto yukleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'personel-foto' and (select public.kebo_izin('personel')));
drop policy if exists "personel foto guncelleme" on storage.objects;
create policy "personel foto guncelleme" on storage.objects for update to authenticated
  using (bucket_id = 'personel-foto' and (select public.kebo_izin('personel')));
drop policy if exists "personel foto silme" on storage.objects;
create policy "personel foto silme" on storage.objects for delete to authenticated
  using (bucket_id = 'personel-foto' and (select public.kebo_izin('personel')));
