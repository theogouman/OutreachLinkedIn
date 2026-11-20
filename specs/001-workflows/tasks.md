# Tasks: Workflows — relance des invitations en attente

**Input**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/interfaces.md](contracts/interfaces.md)
**Tests**: obligatoires (`CLAUDE.md` : test qui échoue d'abord, cas refusés testés). Chaque tâche de code commence par son test.
**Format**: `[ID] [P?] [Story] Description` — `[P]` : parallélisable (fichiers distincts, sans dépendance) ; `[US1]` relance (P1), `[US2]` page Workflow (P2).
**Fin de chaque phase** : `npm run check` vert (Postgres compris), build, Semgrep sur les fichiers modifiés, relecture du diff, `docs/architecture.md`, push sur `main` (migrations appliquées avant).

## Phase 1 — Fondations (incrément 1)

- [x] T001 Migration A `supabase/migrations/20261121000000_retrait_invitation_type.sql` : valeur `retrait_invitation` de `type_action`
- [x] T002 Test `tests/db/automatisations.test.ts` (schéma) : tables `automatisations` et `suivis_automatisation`, RLS lecture seule (autorisé lit, non autorisé et `anon` ne voient rien, aucune écriture depuis `authenticated`), bornes SQL des réglages et du plafond, ligne de départ inactive, quota `retrait_invitation` ≤ 30, `liens_linkedin.invitation_id`, `taches.automatisation_id`
- [x] T003 Migration B `supabase/migrations/20261121000100_automatisations.sql` (fait passer T002)
- [x] T004 Test client (`src/server/unipile/client-v2.test.ts`) : chaque invitation listée porte `invitationId` ; la réponse d'envoi garde son identifiant
- [x] T005 `src/server/unipile/client-v2.ts`, `types.ts` : `invitationId` dans `PersonneListee` (listes d'invitations)
- [x] T006 Test `tests/db/listes-completes.test.ts` + `tests/db/invitations.test.ts` : l'identifiant d'invitation est enregistré sur le lien (liste : remplace ; envoi depuis l'outil : renseigne s'il manque)
- [x] T007 `src/server/relations.ts` (`enregistrerLiens`), `src/server/unipile/executeur.ts` (`effetsListe`, `effetsInvitation`, données d'invitation)
- [x] T008 Test `tests/db/planification.test.ts` + `tests/db/listes-completes.test.ts` : lecture quotidienne des invitations envoyées sur 500 ; liste lue en entier (page non pleine, sans suite) → disparitions constatées ; liste vide ou disparition massive (plus de la moitié des invitations en attente) → aucune conclusion ; étape non rétrogradée pour un prospect suivi par une automatisation
- [x] T009 `src/server/queue/planification.ts`, `src/server/unipile/executeur.ts` (`effetsListe`, `finParcours`)

## Phase 2 — Action « retrait d'invitation » (incrément 2) [US1]

- [x] T010 [P] [US1] Test `src/server/queue/politique.test.ts` : quota et gel propres au retrait ; 404 = constat ; 422 = échec de la seule tâche ; 429/5xx = gel du seul retrait
- [x] T011 [US1] `src/lib/plafonds.ts`, `src/server/queue/politique.ts` : type et quota `retrait_invitation` (maximum 30, défaut 10), libellé, jauge
- [x] T012 [P] [US1] Test client : `retirerInvitation` (200 → retirée, 404 → déjà disparue, réponse invalide refusée)
- [x] T013 [US1] `src/server/unipile/client-v2.ts`, `types.ts`, `fabrique.ts` (`clientNonBranche`), `tests/fixtures/client-simule.ts`
- [x] T014 [US1] Test `tests/db/retrait.test.ts` : exécuteur — revérifie « en attente » et identifiant connu, sinon rien n'est envoyé ; effets : lien retiré, statut « à inviter », étape conservée, journal `retrait_invitation` ; tâche annulable tant qu'elle n'est pas partie
- [x] T015 [US1] `src/server/unipile/executeur.ts` : branche `retrait_invitation` et effets
- [x] T016 [US1] Test `tests/db/invitations.test.ts` : invitation manuelle refusée moins de 21 jours après un retrait (avec la date), acceptée ensuite ; l'exécuteur refuse aussi
- [x] T017 [US1] `src/server/mutations.ts` (`mettreInvitationEnFile`), `executeur.ts`, `src/server/donnees.ts` (date de déblocage sur la fiche)
- [x] T018 [P] [US1] Affichage : `reglages/ligne-tache.tsx` (type « Retrait d'invitation »), `fiche.tsx` (historique), `invitation-prospect.tsx` (bouton grisé + date)

## Phase 3 — Moteur et relance (incrément 3) [US1]

- [ ] T019 [P] [US1] Test `src/lib/automatisations/catalogue.test.ts` : schéma des réglages (bornes, défauts, `cycles` = 1 à 10 ou `null`), modules descriptifs
- [ ] T020 [US1] `src/lib/automatisations/catalogue.ts`
- [ ] T021 [P] [US1] Test `src/server/automatisations/relance-invitations.test.ts` (pur) : chaque transition de `data-model.md` ; délais tirés dans les plages ; minimum de 21 jours ; cycles épuisés → mis de côté ; « sans limite » ; sorties de boucle (acceptation, étape terminale, invitation reçue)
- [ ] T022 [US1] `src/server/automatisations/relance-invitations.ts` (`decider`)
- [ ] T023 [US1] Test `tests/db/moteur-automatisations.test.ts` : suivis créés pour les seuls prospects du CRM ; plafond quotidien (étalement des invitations anciennes) ; idempotence (deux passages = une tâche) ; pause et arrêt d'urgence → rien ; tâche annulée → retour à l'attente ; priorité aux actions manuelles dans le tour de file ; prospect supprimé → suivi supprimé
- [ ] T024 [US1] `src/server/automatisations/moteur.ts` ; `src/server/queue/worker.ts` (priorité 2) ; `src/app/api/worker/tick/route.ts` (appel, mode réel seulement)

## Phase 4 — Page Workflow (incrément 4) [US2]

- [ ] T025 [P] [US2] Test `tests/db/automatisations.test.ts` (actions) : basculer et régler — entrée invalide refusée, bornes, effet sur les décisions suivantes seulement ; lecture : compteurs par état, prochaines et dernières actions
- [ ] T026 [US2] `src/server/mutations.ts`, `src/server/automatisations/lecture.ts`, `src/server/donnees.ts`, `src/app/actions.ts` (`exigerUtilisateur`, Zod, erreurs génériques)
- [ ] T027 [US2] Test : action appelée sans session ou par un utilisateur non autorisé → refusée (`exigerUtilisateur`), aucune écriture
- [ ] T028 [US2] `src/app/(app)/workflow/page.tsx`, `automatisation.tsx` (encadré, interrupteur, réglages, compteurs, prochaines et dernières actions) ; `src/components/navigation.tsx`, `icones-pages.tsx`
- [ ] T029 [P] [US2] `fiche.tsx` : actions d'automatisation marquées comme telles dans l'historique ; état de relance (prochaine étape et date)
- [ ] T030 [US2] Vérification visuelle (téléphone 390 px et bureau, clair et sombre) sur une page d'essai temporaire, jamais committée

## Phase 5 — Finitions

- [ ] T031 `docs/architecture.md` (arborescence, décisions), `specs/001-workflows/` à jour (cases cochées, écarts)
- [ ] T032 Revue sécurité du diff complet (skill `software-security`), Semgrep, revue des refus Unipile au premier cas réel

## Dépendances

Phase 1 → Phase 2 → Phase 3 → Phase 4. Dans une phase : test avant code ; `[P]` en parallèle. L'automatisation est créée inactive : aucune action sur le compte avant activation par l'utilisateur (après la phase 4).
