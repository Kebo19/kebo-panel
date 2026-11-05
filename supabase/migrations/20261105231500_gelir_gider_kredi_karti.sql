-- 05.11.2026: Gelir Gider defterine kredi kartları (TEB Kredi Kartı, Enpara Kredi Kartı) — borç hesabı, Toplam'a girmez.
alter table public.gelir_gider drop constraint if exists gelir_gider_hesap_check;
alter table public.gelir_gider add constraint gelir_gider_hesap_check check (hesap in ('Nakit','TEB','VakıfBank','Enpara','Edenred','Metropol','Setcard','Pluxee','Paye','Multinet','Token Flex','TEB Kredi Kartı','Enpara Kredi Kartı'));
alter table public.gelir_gider drop constraint if exists gelir_gider_hedef_check;
alter table public.gelir_gider add constraint gelir_gider_hedef_check check (
  (tip = 'transfer' and hedef_hesap is not null and hedef_hesap <> hesap
     and hedef_hesap in ('Nakit','TEB','VakıfBank','Enpara','Edenred','Metropol','Setcard','Pluxee','Paye','Multinet','Token Flex','TEB Kredi Kartı','Enpara Kredi Kartı'))
  or (tip <> 'transfer' and hedef_hesap is null));
