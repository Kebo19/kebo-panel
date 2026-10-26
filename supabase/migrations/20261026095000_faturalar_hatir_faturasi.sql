-- Hatır faturası: ödemesi yapılmayan, KDV için kesilen fatura. Kasaya yansımaz, kâr/zarar mal alışına girmez.
alter table public.faturalar add column if not exists hatir_faturasi boolean not null default false;
comment on column public.faturalar.hatir_faturasi is 'Ödemesi yapılmayan, KDV için kesilen fatura. Kasaya yansımaz, kâr/zarar mal alışına girmez.';
