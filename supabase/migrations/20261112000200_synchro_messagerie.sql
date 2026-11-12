-- Synchronisation complète de la messagerie LinkedIn depuis Unipile (copie tenue par Unipile,
-- hors quotas LinkedIn) : toutes les conversations à deux, puis l'historique complet de chacune.
-- Exécutée par petits lots à chaque passage du worker, hors de la file des actions.
-- Écriture et lecture réservées au serveur.

-- Historique complet lu chez Unipile (null : à lire).
alter table public.conversations add column messages_synchro_le timestamptz;

create table public.synchro_messagerie (
  id boolean primary key default true check (id),
  -- Lancée à la main (une fois tous les imports faits).
  active boolean not null default false,
  offset_conversations integer not null default 0 check (offset_conversations >= 0),
  curseur text check (length(curseur) <= 4000),
  liste_terminee_le timestamptz,
  derniere_erreur text check (length(derniere_erreur) <= 500),
  maj timestamptz not null default now()
);
insert into public.synchro_messagerie default values;

alter table public.synchro_messagerie enable row level security;
revoke all on public.synchro_messagerie from anon, authenticated;
