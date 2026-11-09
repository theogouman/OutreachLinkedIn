-- Photos de profil des prospects, téléchargées une fois depuis LinkedIn (public_picture_url de la
-- lecture de profil Unipile) et servies par l'outil (/api/photos/<id>) : la CSP n'autorise que les
-- images du site, et les adresses LinkedIn peuvent expirer. Donnée personnelle minimale, supprimée
-- avec le prospect.
alter table public.prospects add column photo_maj timestamptz;

create table public.photos_prospects (
  prospect_id uuid primary key references public.prospects (id) on delete cascade,
  contenu bytea not null check (octet_length(contenu) between 1 and 307200),
  type_mime text not null check (type_mime in ('image/jpeg', 'image/png', 'image/webp')),
  maj timestamptz not null default now()
);

alter table public.photos_prospects enable row level security;
revoke all on public.photos_prospects from anon, authenticated;
grant select on public.photos_prospects to authenticated;
create policy photos_lecture on public.photos_prospects for select to authenticated
  using (private.est_autorise());
