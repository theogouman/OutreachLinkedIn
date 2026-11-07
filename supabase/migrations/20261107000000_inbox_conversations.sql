-- Inbox (lecture) : conversations LinkedIn synchronisées depuis Unipile.
-- Écriture réservée au serveur (synchronisation, webhooks) ; l'interface lit seulement.
-- L'envoi passera par la file d'attente (phase 2), jamais par une écriture directe ici.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  unipile_chat_id text not null unique,
  -- null = conversation hors CRM (onglet séparé, bouton « Ajouter au CRM »).
  prospect_id uuid references public.prospects (id) on delete set null,
  interlocuteur_nom text,
  interlocuteur_provider_id text,
  dernier_message_at timestamptz,
  non_lu boolean not null default false,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index conversations_prospect_idx on public.conversations (prospect_id);
create index conversations_dernier_idx on public.conversations (dernier_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  unipile_message_id text unique,
  sens text not null check (sens in ('entrant', 'sortant')),
  -- Contenu tiers : affiché en texte brut, jamais interprété en HTML.
  texte text not null check (length(texte) <= 8000),
  envoye_at timestamptz not null,
  modele_id uuid
);

create index messages_conversation_idx on public.messages (conversation_id, envoye_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations, public.messages to authenticated;
-- Marquer une conversation comme lue depuis l'interface.
grant update (non_lu) on public.conversations to authenticated;

create policy conversations_lecture on public.conversations for select to authenticated
  using (private.est_autorise());
create policy conversations_lu on public.conversations for update to authenticated
  using (private.est_autorise()) with check (private.est_autorise());
create policy messages_lecture on public.messages for select to authenticated
  using (private.est_autorise());
