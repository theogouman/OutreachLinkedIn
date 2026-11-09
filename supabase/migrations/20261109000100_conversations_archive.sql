-- Conversations reprises de l'archive LinkedIn (messages.csv) : elles portent l'identifiant de
-- conversation LinkedIn, pas encore l'identifiant de chat Unipile (la documentation ne dit pas
-- s'ils coïncident). Le chat Unipile est relié plus tard : au premier message envoyé depuis
-- l'outil (démarrage de conversation) ou au premier webhook reçu pour ce prospect.
alter table public.conversations
  alter column unipile_chat_id drop not null,
  add column linkedin_conversation_id text unique,
  add constraint conversations_identifiant check (unipile_chat_id is not null or linkedin_conversation_id is not null);
