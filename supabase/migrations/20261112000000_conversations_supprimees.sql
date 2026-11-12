-- Conversations supprimées depuis l'Inbox. La conversation et ses messages sont effacés ;
-- on garde seulement l'identifiant du chat Unipile et la date, pour qu'une future
-- synchronisation de la messagerie ne fasse pas réapparaître les anciens messages.
-- Un nouveau message reçu dans ce chat recrée la conversation (webhook), avec ce seul message.
-- Écriture et lecture réservées au serveur : aucun droit pour l'interface.

create table public.conversations_supprimees (
  unipile_chat_id text primary key,
  supprimee_le timestamptz not null default now()
);

alter table public.conversations_supprimees enable row level security;
revoke all on public.conversations_supprimees from anon, authenticated;
