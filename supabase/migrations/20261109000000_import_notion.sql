-- Import unique du CRM Notion.
-- 1. Informations propres à la liste d'origine d'un prospect (ex. « Page Notion Publique » :
--    page Notion, requête, usage). Objet JSON borné ; les champs affichés sont déclarés par liste
--    dans le code (src/lib/listes.ts) et revalidés à l'affichage.
-- 2. Nouvelle source « notion » pour les liens LinkedIn connus et les exécutions d'import.

alter table public.prospects
  add column details jsonb not null default '{}'::jsonb,
  add constraint prospects_details_objet
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192);

alter table public.liens_linkedin
  drop constraint liens_linkedin_source_check,
  add constraint liens_linkedin_source_check check (source in ('csv', 'sync', 'webhook', 'notion'));

alter table public.sync_runs
  drop constraint sync_runs_type_check,
  add constraint sync_runs_type_check check (type in (
    'csv_relations', 'csv_prospects', 'relations', 'invitations_envoyees', 'invitations_recues', 'conversations',
    'notion_prospects'
  ));
