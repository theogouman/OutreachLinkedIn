-- Interlocuteurs hors CRM : identité lue chez Unipile (lecture de profil de l'interlocuteur),
-- affichée dans l'Inbox et dans sa carte d'infos, sans créer de prospect.
alter table public.conversations
  add column interlocuteur_public_identifier text check (length(interlocuteur_public_identifier) <= 100),
  add column interlocuteur_titre text check (length(interlocuteur_titre) <= 300),
  add column photo_maj timestamptz;

create table public.photos_conversations (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  contenu bytea not null check (octet_length(contenu) between 1 and 307200),
  type_mime text not null check (type_mime in ('image/jpeg', 'image/png', 'image/webp')),
  maj timestamptz not null default now()
);
alter table public.photos_conversations enable row level security;
revoke all on public.photos_conversations from anon, authenticated;
grant select on public.photos_conversations to authenticated;
create policy photos_conversations_lecture on public.photos_conversations for select to authenticated
  using (private.est_autorise());
