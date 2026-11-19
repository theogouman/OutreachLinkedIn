-- Invitations envoyées depuis la fiche prospect.

-- Lien « invitation envoyée » enregistré par l'outil lui-même, au succès de l'envoi.
alter table public.liens_linkedin drop constraint liens_linkedin_source_check;
alter table public.liens_linkedin
  add constraint liens_linkedin_source_check check (source in ('csv', 'sync', 'webhook', 'notion', 'outil'));

-- Push différé : une notification créée dans une transaction (worker, webhook) est poussée
-- après validation, par lot (plusieurs acceptations d'un coup = un seul Push).
alter table public.notifications add column push_a_envoyer boolean not null default false;
create index notifications_push_idx on public.notifications (created_at) where push_a_envoyer;

-- Pipeline : les acceptés arrivent dans « À contacter », séparés des prospects jamais invités.
-- Libellés seulement (codes inchangés : journal, filtres et statistiques restent valables).
update public.etapes set libelle = 'À inviter' where code = 'a_contacter';
update public.etapes set libelle = 'À contacter' where code = 'connecte';
