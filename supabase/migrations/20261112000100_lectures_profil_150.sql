-- Lectures de profil : plafond accepté porté de 80 à 150 par jour (choix de l'utilisateur,
-- 2026-11-12, pour identifier en deux jours les prospects absents de toute liste). La
-- recommandation Unipile v2 reste 80 à 100 par jour pour un compte gratuit ou Premium.
alter table public.quotas drop constraint quotas_check2;
alter table public.quotas add constraint quotas_lecture_profil_plafond
  check (type_quota <> 'lecture_profil' or (plafond_jour <= 150));
