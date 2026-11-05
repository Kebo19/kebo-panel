-- 05.11.2026: Gelir Gider defterine yemek çeki hesapları (alacak; sayfada Toplam'a katılmaz).
alter table public.gelir_gider drop constraint if exists gelir_gider_hesap_check;
alter table public.gelir_gider add constraint gelir_gider_hesap_check check (hesap in ('Nakit','TEB','VakıfBank','Enpara','Edenred','Metropol','Setcard','Pluxee','Paye','Multinet','Token Flex'));
