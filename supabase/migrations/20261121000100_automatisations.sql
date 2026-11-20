-- Workflows (spec 001-workflows, data-model.md) : automatisations régulières, suivi par prospect,
-- retrait d'invitation (quota propre), identifiant d'invitation LinkedIn, origine des tâches.
-- Écrites par le serveur seulement (actions vérifiées, worker) ; l'interface les lit via la RLS.

-- ─── Retrait d'invitation : quota propre (10 par jour, 30 au plus) et journal ─────────────────
alter table public.quotas drop constraint quotas_type_quota_check;
alter table public.quotas add constraint quotas_type_quota_check
  check (type_quota in ('invitation', 'note_invitation', 'lecture_profil', 'message', 'lecture_liste', 'retrait_invitation'));
alter table public.quotas add constraint quotas_retrait_invitation_plafond
  check (type_quota <> 'retrait_invitation' or (plafond_jour <= 30));
insert into public.quotas (type_quota, plafond_jour) values ('retrait_invitation', 10);

alter table public.actions drop constraint actions_type_check;
alter table public.actions add constraint actions_type_check check (type in (
  'invitation', 'message', 'lecture_profil', 'lecture_liste', 'retrait_invitation',
  'acceptation', 'reponse', 'changement_etape'
));
alter table public.actions drop constraint actions_check;
alter table public.actions add constraint actions_check
  check (sortante = (type in ('invitation', 'message', 'lecture_profil', 'lecture_liste', 'retrait_invitation')));

-- ─── Identifiant de l'invitation chez LinkedIn (nécessaire au retrait) ────────────────────────
alter table public.liens_linkedin add column invitation_id text
  constraint liens_linkedin_invitation_id_check check (length(invitation_id) between 1 and 300);

-- ─── Automatisations ─────────────────────────────────────────────────────────────────────────
create table public.automatisations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique constraint automatisations_code_check check (code in ('relance_invitations')),
  nom text not null check (length(btrim(nom)) between 1 and 60),
  active boolean not null default false,
  reglages jsonb not null default '{}'
    constraint automatisations_reglages_objet check (jsonb_typeof(reglages) = 'object' and pg_column_size(reglages) <= 4096),
  modules jsonb not null default '[]'
    constraint automatisations_modules_tableau check (jsonb_typeof(modules) = 'array' and pg_column_size(modules) <= 8192),
  active_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dernière barrière (les réglages sont validés par Zod) : LinkedIn refuse une nouvelle invitation
  -- avant 3 semaines, et le plafond quotidien étale l'effet d'une activation.
  constraint automatisations_reinvitation_21_jours check (
    code <> 'relance_invitations' or jsonb_typeof(reglages) <> 'object'
    or case when jsonb_typeof(reglages -> 'reinvitation_jours' -> 'min') = 'number'
            then (reglages -> 'reinvitation_jours' ->> 'min')::numeric >= 21 else false end),
  constraint automatisations_plafond_jour check (
    code <> 'relance_invitations' or jsonb_typeof(reglages) <> 'object'
    or case when jsonb_typeof(reglages -> 'plafond_jour') = 'number'
            then (reglages ->> 'plafond_jour')::numeric between 1 and 20 else false end),
  constraint automatisations_cycles check (
    code <> 'relance_invitations' or jsonb_typeof(reglages) <> 'object'
    or case jsonb_typeof(reglages -> 'cycles')
         when 'null' then true
         when 'number' then (reglages ->> 'cycles')::numeric between 1 and 10
         else false end)
);

insert into public.automatisations (code, nom, reglages, modules) values (
  'relance_invitations',
  'Relance des invitations en attente',
  '{"attente_jours": {"min": 21, "max": 28}, "reinvitation_jours": {"min": 21, "max": 25}, "cycles": 2, "plafond_jour": 10}',
  '[{"type": "declencheur", "code": "invitation_en_attente"},
    {"type": "attente", "reglage": "attente_jours"},
    {"type": "condition", "code": "toujours_en_attente"},
    {"type": "action", "code": "retirer_invitation"},
    {"type": "attente", "reglage": "reinvitation_jours"},
    {"type": "action", "code": "inviter"},
    {"type": "boucle", "vers": 1, "reglage": "cycles"}]'
);

-- ─── Suivi d'un prospect par une automatisation ──────────────────────────────────────────────
create table public.suivis_automatisation (
  id uuid primary key default gen_random_uuid(),
  automatisation_id uuid not null references public.automatisations (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  etat text not null constraint suivis_automatisation_etat_check check (etat in (
    'attente_retrait', 'retrait_en_file', 'attente_reinvitation', 'reinvitation_en_file', 'mis_de_cote', 'termine'
  )),
  cycle integer not null default 0 check (cycle >= 0),
  prochaine_decision_le timestamptz,
  invitation_envoyee_le timestamptz not null,
  retiree_le timestamptz,
  motif text check (length(motif) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automatisation_id, prospect_id)
);
create index suivis_automatisation_echeance_idx on public.suivis_automatisation (etat, prochaine_decision_le);
create index suivis_automatisation_prospect_idx on public.suivis_automatisation (prospect_id);

-- ─── Origine d'une tâche de la file ──────────────────────────────────────────────────────────
alter table public.taches add column automatisation_id uuid references public.automatisations (id) on delete set null;

-- ─── Droits : lecture seule pour l'interface, rien pour anon ─────────────────────────────────
alter table public.automatisations enable row level security;
alter table public.suivis_automatisation enable row level security;
revoke all on public.automatisations, public.suivis_automatisation from anon, authenticated;
grant select on public.automatisations, public.suivis_automatisation to authenticated;
create policy automatisations_lecture on public.automatisations for select to authenticated using (private.est_autorise());
create policy suivis_automatisation_lecture on public.suivis_automatisation for select to authenticated using (private.est_autorise());
