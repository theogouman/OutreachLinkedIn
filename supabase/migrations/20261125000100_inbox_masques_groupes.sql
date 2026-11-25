-- Inbox : personnes masquées (« Ne plus afficher »), récupérables par le filtre « Masquées ».
-- Clé : l'identifiant LinkedIn de la personne (ses conversations actuelles et futures), ou, à
-- défaut, la conversation seule. Écriture par le serveur uniquement.
create table public.inbox_masques (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique check (provider_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  conversation_id uuid unique references public.conversations (id) on delete cascade,
  masque_le timestamptz not null default now(),
  constraint inbox_masques_cible check ((provider_id is null) <> (conversation_id is null))
);
alter table public.inbox_masques enable row level security;
revoke all on public.inbox_masques from anon, authenticated;
grant select on public.inbox_masques to authenticated;
create policy inbox_masques_lecture on public.inbox_masques for select to authenticated using (private.est_autorise());

-- Personnes associées : un groupe réunit des prospects liés (même entreprise, ou relié à la main).
-- Un prospect appartient à un groupe au plus ; un groupe de moins de deux personnes est supprimé.
create table public.groupes_personnes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.groupes_personnes enable row level security;
revoke all on public.groupes_personnes from anon, authenticated;
grant select on public.groupes_personnes to authenticated;
create policy groupes_personnes_lecture on public.groupes_personnes for select to authenticated using (private.est_autorise());

alter table public.prospects add column groupe_id uuid references public.groupes_personnes (id) on delete set null;
create index prospects_groupe_idx on public.prospects (groupe_id) where groupe_id is not null;
-- Droits : comme les autres colonnes de prospects (RLS private.est_autorise) ; l'interface
-- passe par les actions serveur (associerProspects, dissocierProspect).
