-- 05.11.2026: Gelir Gider defteri tamamen elle tutulur; her kayıt bir hesaba (Nakit/TEB/VakıfBank/Enpara) yazılır.
alter table public.gelir_gider add column if not exists hesap text not null default 'Nakit';
alter table public.gelir_gider drop constraint if exists gelir_gider_hesap_check;
alter table public.gelir_gider add constraint gelir_gider_hesap_check check (hesap in ('Nakit','TEB','VakıfBank','Enpara'));
