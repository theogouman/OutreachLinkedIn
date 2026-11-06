-- Schéma initial — phase 1 (socle).
-- Source de vérité : cette base. Notion n'est qu'une source d'import ponctuelle.
-- Le worker se connecte en direct (rôle postgres, hors RLS). L'interface passe par
-- Supabase avec le rôle `authenticated`, soumis aux politiques RLS en fin de fichier.

-- ─── Types ────────────────────────────────────────────────────────────────────

create type public.statut_relation as enum ('en_relation', 'en_attente', 'invitation_recue', 'a_inviter');

-- Actions sortantes vers LinkedIn (via Unipile). Chacune a son quota et son gel.
create type public.type_action as enum ('invitation', 'message', 'lecture_profil', 'lecture_liste');

create type public.statut_tache as enum ('en_attente', 'en_cours', 'faite', 'echec', 'annulee', 'incertaine');

create type public.type_lien as enum ('relation', 'invitation_envoyee', 'invitation_recue');

-- ─── Réglages (une seule ligne) ───────────────────────────────────────────────

create table public.reglages (
  id boolean primary key default true check (id),
  type_compte text not null default 'gratuit' check (type_compte in ('gratuit')),
  fuseau text not null default 'Europe/Paris',
  -- jours : 1 = lundi … 7 = dimanche ; créneaux en heure locale "HH:MM".
  plages jsonb not null default '{"jours":[1,2,3,4,5],"creneaux":[{"debut":"09:00","fin":"12:30"},{"debut":"14:00","fin":"18:30"}]}',
  delai_min_s integer not null default 120 check (delai_min_s >= 60),
  delai_max_s integer not null default 360,
  cadence_relances jsonb not null default '{"relance_1_jours":4,"relance_2_jours":7}',
  arret_d_urgence boolean not null default false,
  -- Fixé après chaque action sortante : maintenant + délai aléatoire.
  prochaine_action_possible_a timestamptz,
  updated_at timestamptz not null default now(),
  check (delai_max_s >= delai_min_s)
);
insert into public.reglages default values;

-- ─── Quotas ───────────────────────────────────────────────────────────────────
-- Les compteurs ne sont PAS stockés ici : ils se calculent sur `actions`.
-- Les CHECK reprennent les maxima d'un compte gratuit (docs/plan-v1.md) : dernière
-- barrière si l'interface laissait passer une valeur trop haute.

create table public.quotas (
  type_quota text primary key
    check (type_quota in ('invitation', 'note_invitation', 'lecture_profil', 'message', 'lecture_liste')),
  plafond_jour integer check (plafond_jour >= 0),
  plafond_semaine integer check (plafond_semaine >= 0),
  plafond_mois integer check (plafond_mois >= 0),
  gel_jusqu_a timestamptz,
  updated_at timestamptz not null default now(),
  check (type_quota <> 'invitation' or (plafond_jour <= 30 and plafond_semaine <= 150)),
  check (type_quota <> 'note_invitation' or (plafond_mois <= 5)),
  check (type_quota <> 'lecture_profil' or (plafond_jour <= 80)),
  check (type_quota <> 'message' or (plafond_jour <= 100)),
  check (type_quota <> 'lecture_liste' or (plafond_jour <= 4))
);

insert into public.quotas (type_quota, plafond_jour, plafond_semaine, plafond_mois) values
  ('invitation', 20, 100, null),
  ('note_invitation', null, null, 4),
  ('lecture_profil', 40, null, null),
  ('message', 50, null, null),
  ('lecture_liste', 3, null, null);

-- ─── Étapes du pipeline (liste réglable) ──────────────────────────────────────

create table public.etapes (
  code text primary key,
  libelle text not null,
  ordre integer not null unique,
  terminale boolean not null default false
);

insert into public.etapes (code, libelle, ordre, terminale) values
  ('a_contacter', 'À contacter', 10, false),
  ('invitation_envoyee', 'Invitation envoyée', 20, false),
  ('connecte', 'Connecté', 30, false),
  ('premier_message', 'Premier message', 40, false),
  ('relance_1', 'Relance 1', 50, false),
  ('relance_2', 'Relance 2', 60, false),
  ('repondu', 'Répondu', 70, false),
  ('rdv_fixe', 'RDV fixé', 80, false),
  ('gagne', 'Gagné', 90, true),
  ('perdu', 'Perdu', 100, true),
  ('pas_interesse', 'Pas intéressé', 110, true);

-- ─── Prospects ────────────────────────────────────────────────────────────────
-- Données personnelles (RGPD) : uniquement ces champs. Suppression complète possible.

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  linkedin_url text not null,
  url_normalisee text not null unique,
  public_identifier text,
  provider_id text unique,
  prenom text,
  nom text,
  poste text,
  entreprise text,
  liste_origine text,
  statut_relation public.statut_relation not null default 'a_inviter',
  etape text not null default 'a_contacter' references public.etapes (code) on update cascade,
  prochaine_relance date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospects_statut_relation_idx on public.prospects (statut_relation);
create index prospects_etape_idx on public.prospects (etape);
create index prospects_prochaine_relance_idx on public.prospects (prochaine_relance);

-- ─── Liens LinkedIn connus (relations, invitations) ───────────────────────────
-- Alimenté par le CSV d'archive, les synchronisations de listes et les webhooks.
-- Pour les personnes hors CRM : seulement l'URL normalisée et la date.

create table public.liens_linkedin (
  id uuid primary key default gen_random_uuid(),
  type public.type_lien not null,
  url_normalisee text not null,
  provider_id text,
  date_lien timestamptz,
  source text not null check (source in ('csv', 'sync', 'webhook')),
  vu_le timestamptz not null default now(),
  unique (type, url_normalisee)
);

create index liens_linkedin_provider_idx on public.liens_linkedin (provider_id);

-- ─── File d'attente ───────────────────────────────────────────────────────────

create table public.taches (
  id uuid primary key default gen_random_uuid(),
  -- Ordre de demande : sert à l'ordre de départ (par type et par prospect).
  ordre bigint generated always as identity unique,
  type_action public.type_action not null,
  prospect_id uuid references public.prospects (id) on delete cascade,
  payload jsonb not null default '{}',
  avec_note boolean not null default false,
  statut public.statut_tache not null default 'en_attente',
  cle_idempotence text not null unique,
  executer_apres timestamptz not null default now(),
  tentatives integer not null default 0,
  verrou_jusqu_a timestamptz,
  motif_attente text,
  derniere_erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (avec_note = false or type_action = 'invitation')
);

create index taches_file_idx on public.taches (type_action, ordre) where statut = 'en_attente';
create index taches_prospect_idx on public.taches (prospect_id, ordre)
  where statut in ('en_attente', 'en_cours', 'incertaine');

-- ─── Journal des actions et événements ────────────────────────────────────────
-- Pièce centrale : historique, statistiques et compteurs de quotas.
-- prospect_id passe à NULL à la suppression d'un prospect : effacer son historique
-- ne doit pas faire baisser les compteurs de quotas du jour.

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete set null,
  tache_id uuid references public.taches (id) on delete set null,
  type text not null check (type in (
    'invitation', 'message', 'lecture_profil', 'lecture_liste',
    'acceptation', 'reponse', 'changement_etape'
  )),
  -- true = appel vers LinkedIn, compté dans les quotas.
  sortante boolean not null,
  avec_note boolean not null default false,
  resultat text not null check (resultat in ('en_cours', 'succes', 'echec', 'incertain')),
  code_erreur text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (sortante = (type in ('invitation', 'message', 'lecture_profil', 'lecture_liste')))
);

create index actions_quota_idx on public.actions (type, created_at) where sortante;
create index actions_prospect_idx on public.actions (prospect_id, created_at);

-- ─── Synchronisations et imports ──────────────────────────────────────────────

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('csv_relations', 'csv_prospects', 'relations', 'invitations_envoyees', 'invitations_recues', 'conversations')),
  debut timestamptz not null default now(),
  fin timestamptz,
  nb_elements integer,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'succes', 'echec')),
  erreur text
);

-- ─── Webhooks reçus (idempotence) ─────────────────────────────────────────────

create table public.webhook_events (
  id text primary key,
  type text not null,
  recu_le timestamptz not null default now(),
  traite_le timestamptz
);

-- ─── Accès : utilisateur autorisé uniquement ──────────────────────────────────

create table public.utilisateurs_autorises (
  email text primary key check (email = lower(email))
);

create function public.est_autorise() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.utilisateurs_autorises
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Supabase accorde par défaut EXECUTE à anon sur les nouvelles fonctions : on le retire.
revoke all on function public.est_autorise() from public, anon;
grant execute on function public.est_autorise() to authenticated;

-- RLS partout. Aucun accès pour `anon`. Lecture seule sur les tables que seul le
-- worker ou le serveur doivent écrire (journal, webhooks, synchronisations).
alter table public.reglages enable row level security;
alter table public.quotas enable row level security;
alter table public.etapes enable row level security;
alter table public.prospects enable row level security;
alter table public.liens_linkedin enable row level security;
alter table public.taches enable row level security;
alter table public.actions enable row level security;
alter table public.sync_runs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.utilisateurs_autorises enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Droits par colonne : depuis l'interface, impossible de lever un gel ou d'avancer
-- la prochaine action possible (contournement de l'espacement).
grant select on public.reglages to authenticated;
grant update (plages, delai_min_s, delai_max_s, cadence_relances, arret_d_urgence, updated_at)
  on public.reglages to authenticated;
grant select on public.quotas to authenticated;
grant update (plafond_jour, plafond_semaine, plafond_mois, updated_at) on public.quotas to authenticated;
grant select, insert, update, delete on public.etapes to authenticated;
grant select, insert, update, delete on public.prospects to authenticated;
grant select on public.liens_linkedin to authenticated;
-- Tâches : l'interface ajoute, annule ou modifie une tâche pas encore partie.
grant select, insert, update on public.taches to authenticated;
grant select on public.actions to authenticated;
grant select on public.sync_runs to authenticated;

create policy reglages_autorise on public.reglages for all to authenticated
  using (public.est_autorise()) with check (public.est_autorise());
create policy quotas_autorise on public.quotas for all to authenticated
  using (public.est_autorise()) with check (public.est_autorise());
create policy etapes_autorise on public.etapes for all to authenticated
  using (public.est_autorise()) with check (public.est_autorise());
create policy prospects_autorise on public.prospects for all to authenticated
  using (public.est_autorise()) with check (public.est_autorise());
create policy liens_linkedin_lecture on public.liens_linkedin for select to authenticated
  using (public.est_autorise());
create policy actions_lecture on public.actions for select to authenticated
  using (public.est_autorise());
create policy sync_runs_lecture on public.sync_runs for select to authenticated
  using (public.est_autorise());

-- Tâches : l'interface ne crée que des tâches en attente et ne peut modifier
-- qu'une tâche encore en attente (texte d'un message, annulation).
create policy taches_lecture on public.taches for select to authenticated
  using (public.est_autorise());
create policy taches_ajout on public.taches for insert to authenticated
  with check (public.est_autorise() and statut = 'en_attente' and tentatives = 0 and verrou_jusqu_a is null);
create policy taches_modif on public.taches for update to authenticated
  using (public.est_autorise() and statut = 'en_attente')
  with check (public.est_autorise() and statut in ('en_attente', 'annulee') and verrou_jusqu_a is null);
