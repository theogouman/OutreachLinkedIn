# Plan v1 — Outil de prospection LinkedIn

Plan validé le 2026-11-06. Brief source : « Prompt — Outil de prospection LinkedIn (CRM, Inbox, Statistiques) ».
Faits vérifiés dans la documentation Unipile (v1 et v2), Vercel et Supabase le 2026-11-06.

## Décisions

| Sujet | Décision |
|---|---|
| Compte LinkedIn | Gratuit, ancien (avec historique). |
| Plafonds | Valeurs par défaut prudentes, réglables dans l'interface, bornées par la recommandation Unipile (voir ci-dessous). |
| Plages horaires | Lun–ven, 9h–12h30 et 14h–18h30, Europe/Paris. Réglables. |
| Délai entre deux actions sortantes | Aléatoire entre 2 et 6 min. Réglable. |
| Cadence de relances | Relance 1 à J+4 après le premier message, relance 2 à J+7 après la relance 1. Réglable dans l'interface, rien en dur. |
| Notion | Source d'import ponctuelle uniquement, via l'export CSV d'une base Notion. Pas d'API Notion, pas de lien conservé, pas d'écriture retour. |
| Unipile | API v2 derrière une interface ; client simulé (mock) tant que le compte n'est pas branché. Branchement final par variables Vercel. |
| Déclenchement du worker | Supabase pg_cron, chaque minute, vers `/api/worker/tick` (secret). Compatible Vercel Hobby. Repli : Vercel Pro. |
| Ordre de la file | Premier demandé, premier parti, **par type d'action** ; pour un même prospect, ordre strict tous types confondus. Un gel des invitations ne bloque donc pas les messages. |
| Envoi incertain | Jamais deux fois. Une tâche interrompue en cours d'envoi passe « incertaine », n'est jamais relancée seule, et est réconciliée via Unipile ou tranchée par l'utilisateur. |
| Relations hors CRM | Seules l'URL normalisée et la date de connexion sont conservées. |
| CodeGuard | Installé en skill (`.claude/skills/software-security/`). |

## Plafonds (compte gratuit)

| Action | Recommandation Unipile | Défaut | Maximum accepté par l'interface |
|---|---|---|---|
| Invitation sans note | ~150 / semaine | 20 / jour, 100 / semaine | 30 / jour (150 ÷ 5 jours ouvrés), 150 / semaine |
| Invitation avec note (≤ 200 caractères) | ~5 / mois (doc v1 et guide v2) ; ~15 / semaine (page limites v2) | 4 / mois | 5 / mois — la valeur prudente l'emporte |
| Lecture de profil | 80 à 100 / jour | 40 / jour | 80 / jour |
| Envoi de message | 100 à 150 / jour | 50 / jour | 100 / jour |
| Lecture d'une liste (relations, invitations) | « quelques fois par jour », ≤ 4 appels / heure | 3 / jour | 4 / jour |

Une invitation avec note compte à la fois dans le quota d'invitations et dans le quota de notes.
Erreurs : 422 `cannot_resend_yet` (invitations), 429 `provider/too_many_requests`, 500 → gel 24 h du type d'action.
429 `api/too_many_requests` (limite propre à Unipile) → attente selon l'en-tête `retry-after`, sans gel.

## Architecture

Next.js 16 + TypeScript sur Vercel, Supabase (Postgres, Auth, Realtime).

- Interface → table `taches` → worker (`/api/worker/tick`, appelé chaque minute par pg_cron) → Unipile v2 → LinkedIn.
- Le worker se connecte directement à Postgres (driver `pg`) pour décider et réserver une tâche dans une seule transaction, sous verrou consultatif : un seul worker actif à la fois. L'appel Unipile se fait hors transaction.
- Les règles de décision (arrêt, plage horaire, gel, quotas jour / semaine / mois, espacement) sont des fonctions pures, testées sans base.
- Quotas : comptés dans `actions` (lignes sortantes), journée et semaine en Europe/Paris, semaine du lundi. Une tentative est journalisée avant l'appel et compte même si l'appel échoue.
- Webhooks Unipile v2 : signature HMAC-SHA256 (`unipile-signature`), horodatage ≤ 5 min, idempotence par identifiant d'événement.
- Pas d'événement « invitation acceptée » en v2 : `relation.new` (jusqu'à 6 h de retard) + lecture de la première page des relations et des invitations envoyées 3 fois par jour à heures aléatoires, via la file.
- Previews Vercel : client Unipile simulé et base de test.

## Phase 1 — tâches

1. Base : migrations, RLS, Postgres de test en CI.
2. Authentification : lien magique, inscriptions coupées, liste d'autorisation.
3. Normalisation des URL LinkedIn.
4. Import `Connections.csv` (aucun appel LinkedIn).
5. Calcul du statut de relation.
6. Règles de décision du worker (TDD).
7. Réservation de tâche en SQL, ordre par type et par prospect, verrou, tâches incertaines.
8. Route du worker : secret, une tâche par passage, journal, gel.
9. Client Unipile v2 + client simulé.
10. Import des prospects depuis l'export CSV Notion + tâche de lecture de profil.
11. Synchronisation des statuts par listes.
12. Webhook signé et idempotent.
13. Réglages : plafonds bornés, plages, délais, cadence, bouton d'arrêt.
14. Interface : jauge de quotas et état de la file, liste CRM, vue File d'attente.
15. Mise en production : pg_cron, variables Vercel, mode simulé en preview.
