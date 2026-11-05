-- 05.11.2026: Gelir Gider defterinde hesaplar arası virman (tip 'transfer', hesap → hedef_hesap).
alter table public.gelir_gider add column if not exists hedef_hesap text;
alter table public.gelir_gider drop constraint if exists gelir_gider_tip_check;
alter table public.gelir_gider add constraint gelir_gider_tip_check check (tip in ('gelir','gider','transfer'));
alter table public.gelir_gider drop constraint if exists gelir_gider_hedef_check;
alter table public.gelir_gider add constraint gelir_gider_hedef_check check (
  (tip = 'transfer' and hedef_hesap is not null and hedef_hesap <> hesap
     and hedef_hesap in ('Nakit','TEB','VakıfBank','Enpara','Edenred','Metropol','Setcard','Pluxee','Paye','Multinet','Token Flex'))
  or (tip <> 'transfer' and hedef_hesap is null));
