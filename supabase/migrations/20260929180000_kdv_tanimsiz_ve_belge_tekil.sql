-- Carilerin KDV oranı bilinçli seçilsin: varsayılan kaldırıldı, mevcut (hepsi otomatik 20) değerler boşaltıldı.
alter table cariler alter column varsayilan_kdv drop default;
update cariler set varsayilan_kdv = null where varsayilan_kdv = 20;
-- İrsaliyeden faturaya: aynı belgeden iki fatura oluşmasın.
create unique index if not exists faturalar_belge_id_tekil on faturalar(belge_id) where belge_id is not null;
