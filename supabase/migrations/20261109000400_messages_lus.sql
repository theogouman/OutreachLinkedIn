-- Accusé de lecture (webhook message.receipt.read) : moment où l'interlocuteur a lu nos messages.
alter table public.messages add column lu_le timestamptz;
