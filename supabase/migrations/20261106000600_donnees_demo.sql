-- Données de démonstration : marquées pour être traitées par le client Unipile simulé
-- uniquement, et supprimables d'un coup avant le passage en réel.
alter table public.prospects add column demo boolean not null default false;
create index prospects_demo_idx on public.prospects (demo) where demo;
