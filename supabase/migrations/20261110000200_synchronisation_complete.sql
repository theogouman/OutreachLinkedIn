-- Synchronisation complète des listes LinkedIn (relations, invitations envoyées) : une page par
-- tâche, la suivante mise en file avec le curseur. Unipile autorise plusieurs appels pour la
-- synchronisation initiale, puis la première page seulement quelques fois par jour.
-- Le plafond des lectures de listes peut donc monter le temps d'un parcours complet (remis à 3 après).
alter table public.quotas drop constraint quotas_check4;
alter table public.quotas add constraint quotas_lecture_liste_plafond
  check (type_quota <> 'lecture_liste' or (plafond_jour <= 100));
