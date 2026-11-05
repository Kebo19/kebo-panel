-- 05.11.2026: Elle girilen basit gelir-gider defteri (/gelir-gider). Kasa yetkisi olanlar görür ve yazar.
-- Diğer tablolardan bağımsızdır: kasa bakiyesini ve Kâr / Zarar'ı etkilemez.
create table if not exists public.gelir_gider (
  id uuid primary key default gen_random_uuid(),
  tarih date not null default (now() at time zone 'Europe/Istanbul')::date,
  tip text not null check (tip in ('gelir', 'gider')),
  aciklama text not null check (length(trim(aciklama)) between 1 and 200),
  tutar numeric not null check (tutar > 0),
  ekleyen text default coalesce(split_part(auth.jwt() ->> 'email', '@', 1), 'panel'),
  created_at timestamptz not null default now()
);
create index if not exists gelir_gider_tarih_idx on public.gelir_gider (tarih);

alter table public.gelir_gider enable row level security;
drop policy if exists kebo_okuma on public.gelir_gider;
drop policy if exists kebo_yazma on public.gelir_gider;
create policy kebo_okuma on public.gelir_gider for select to authenticated using ((select public.kebo_izin('kasa')));
create policy kebo_yazma on public.gelir_gider for all to authenticated
  using ((select public.kebo_izin('kasa'))) with check ((select public.kebo_izin('kasa')));
revoke all on public.gelir_gider from anon;

drop trigger if exists trg_islem_gecmisi on public.gelir_gider;
create trigger trg_islem_gecmisi after insert or delete or update on public.gelir_gider
  for each row execute function public.kebo_islem_kaydet();
