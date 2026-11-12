-- Synchronisation de la messagerie : premier élément de la dernière page lue. Une page qui revient
-- identique (décalage ignoré par le fournisseur) arrête la liste au lieu de boucler.
alter table public.synchro_messagerie add column premier_vu text check (length(premier_vu) <= 300);
