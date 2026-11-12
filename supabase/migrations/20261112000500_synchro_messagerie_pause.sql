-- Synchronisation de la messagerie : pause demandée par Unipile (429, en-tête retry-after).
alter table public.synchro_messagerie add column reprendre_apres timestamptz;
