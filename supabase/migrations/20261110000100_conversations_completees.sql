-- Complétion immédiate des conversations (nom et photo lus par « Get a Chat », sans visite de profil)
-- et rattachement provisoire par le nom, confirmé ou corrigé par la lecture de profil.
alter table public.conversations
  add column interlocuteur_complete_le timestamptz,
  add column rattachement_par_nom boolean not null default false;
