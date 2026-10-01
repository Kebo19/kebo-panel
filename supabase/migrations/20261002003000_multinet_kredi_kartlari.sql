-- 02.10.2026
-- 1) Multinet kasa raporundaki yemek kartlarına eklendi.
alter table public.gunluk_raporlar add column if not exists kasa_multinet numeric default 0;

-- ay_devir_durumu: yemek kartı satışlarına Multinet de girsin.
do $$
declare d text; y text;
begin
  select pg_get_functiondef('public.ay_devir_durumu(date)'::regprocedure) into d;
  if position('kasa_multinet' in d) > 0 then return; end if;
  y := replace(d, 'coalesce(kasa_paye, 0))', 'coalesce(kasa_paye, 0) + coalesce(kasa_multinet, 0))');
  if y = d then raise exception 'ay_devir_durumu beklenen biçimde değil, değiştirilmedi'; end if;
  execute y;
end $$;

-- 2) Kredi kartları. Kartın adı kasa_manuel_islemler.hesap olarak kullanılır:
--    karttan yapılan gider borcu artırır; bankadan karta transfer (ödeme) ve karta gelir (iade) borcu azaltır.
create table if not exists public.kredi_kartlari (
  id uuid primary key default gen_random_uuid(),
  ad text not null unique,
  banka text not null,
  kart_limiti numeric not null default 0,
  hesap_kesim_gunu int check (hesap_kesim_gunu between 1 and 31),
  son_odeme_gunu int check (son_odeme_gunu between 1 and 31),
  -- açılış tarihindeki borç (o güne kadarki harcamalar Kasa'da yok)
  acilis_borcu numeric not null default 0,
  acilis_tarihi date not null default date '2026-10-01',
  aktif boolean not null default true,
  sira int not null default 0,
  created_at timestamptz default now()
);
alter table public.kredi_kartlari enable row level security;
drop policy if exists kebo_okuma on public.kredi_kartlari;
create policy kebo_okuma on public.kredi_kartlari for select to authenticated
  using ((select kebo_izin('kasa')) or (select kebo_izin('kar_zarar')) or (select kebo_izin('anasayfa')) or (select kebo_izin('cari')));
drop policy if exists kebo_yazma on public.kredi_kartlari;
create policy kebo_yazma on public.kredi_kartlari for all to authenticated
  using ((select kebo_izin('kasa'))) with check ((select kebo_izin('kasa')));
drop trigger if exists trg_islem_gecmisi on public.kredi_kartlari;
create trigger trg_islem_gecmisi after insert or update or delete on public.kredi_kartlari
  for each row execute function kebo_islem_kaydet();

insert into public.kredi_kartlari (ad, banka, sira) values
  ('TEB Kredi Kartı', 'TEB', 1),
  ('Enpara Kredi Kartı', 'Enpara', 2)
on conflict (ad) do nothing;

-- 3) Cari ödemesi / avans bir kredi kartından yapılırsa da Kasa'ya (kartın borcuna) yansısın.
do $$
declare d text; y text;
begin
  select pg_get_functiondef('public.kebo_kasa_ayna()'::regprocedure) into d;
  if position('kredi_kartlari' in d) > 0 then return; end if;
  y := replace(d, $a$if v_hesap in ('Nakit', 'TEB', 'VakıfBank', 'Enpara') and$a$,
    $b$if (v_hesap in ('Nakit', 'TEB', 'VakıfBank', 'Enpara') or exists (select 1 from public.kredi_kartlari k where k.ad = v_hesap)) and$b$);
  if y = d then raise exception 'kebo_kasa_ayna beklenen biçimde değil, değiştirilmedi'; end if;
  execute y;
end $$;
