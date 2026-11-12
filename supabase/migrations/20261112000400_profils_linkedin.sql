-- Profil LinkedIn d'un prospect, issu d'un enrichissement externe (export Apify) : titre, contact,
-- « À propos », entreprise actuelle, expériences, formation. Donnée tierce : bornée ici, revalidée
-- à l'affichage (src/lib/profil-linkedin.ts). Supprimée avec le prospect.
-- Lecture pour l'utilisateur autorisé ; écriture réservée au serveur.

create table public.profils_linkedin (
  prospect_id uuid primary key references public.prospects (id) on delete cascade,
  source text not null check (source in ('apify')),
  lu_le timestamptz not null,
  titre text check (length(titre) <= 500),
  localisation text check (length(localisation) <= 200),
  a_propos text check (length(a_propos) <= 5000),
  email text check (length(email) <= 320),
  relations integer check (relations >= 0),
  abonnes integer check (abonnes >= 0),
  entreprise jsonb not null default '{}' check (jsonb_typeof(entreprise) = 'object'),
  experiences jsonb not null default '[]' check (jsonb_typeof(experiences) = 'array'),
  formation jsonb not null default '[]' check (jsonb_typeof(formation) = 'array'),
  -- Autres sections (langues, certifications, projets…) gardées pour plus tard, non affichées.
  autres jsonb not null default '{}' check (jsonb_typeof(autres) = 'object'),
  -- Poste et entreprise de la fiche avant leur mise à jour par l'enrichissement.
  avant jsonb check (avant is null or jsonb_typeof(avant) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.profils_linkedin enable row level security;
revoke all on public.profils_linkedin from anon, authenticated;
grant select on public.profils_linkedin to authenticated;
create policy profils_linkedin_lecture on public.profils_linkedin for select to authenticated
  using (private.est_autorise());
