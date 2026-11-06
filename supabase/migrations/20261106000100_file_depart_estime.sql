-- Heure de départ estimée et motif d'attente, mis à jour par le worker pour la vue
-- « File d'attente ». N'influencent pas l'ordre de départ (colonne `ordre`).
alter table public.taches add column depart_estime timestamptz;

comment on column public.taches.motif_attente is
  'Dernier motif d''attente calculé par le worker (quota_jour, gel, hors_plage, ...).';
