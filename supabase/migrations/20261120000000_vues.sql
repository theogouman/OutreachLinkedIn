-- Vues enregistrées d'une liste (Prospects) : une mise en page du catalogue (table, galerie…)
-- et ses réglages (propriétés affichées…), revalidés par le serveur à la lecture et à l'écriture.
-- Écrites par le serveur seulement (actions vérifiées) ; l'interface les lit via la RLS.

create table public.vues (
  id uuid primary key default gen_random_uuid(),
  liste text not null check (liste in ('prospects')),
  nom text not null check (length(btrim(nom)) between 1 and 60),
  type text not null check (type in ('table', 'galerie')),
  options jsonb not null default '{}'
    constraint vues_options_objet check (jsonb_typeof(options) = 'object' and pg_column_size(options) <= 4096),
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index vues_liste_idx on public.vues (liste, ordre);

alter table public.vues enable row level security;
revoke all on public.vues from anon, authenticated;
grant select on public.vues to authenticated;
create policy vues_lecture on public.vues for select to authenticated using (private.est_autorise());

-- Vues de départ : la table actuelle et la galerie.
insert into public.vues (liste, nom, type, options, ordre) values
  ('prospects', 'Table', 'table', '{"proprietes": ["entreprise", "relation", "etape", "relance", "liste"]}', 0),
  ('prospects', 'Galerie', 'galerie', '{"proprietes": ["entreprise", "relation", "etape", "liste"]}', 1);
