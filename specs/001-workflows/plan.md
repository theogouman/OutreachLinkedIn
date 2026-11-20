# Implementation Plan: Workflows — relance des invitations en attente

**Branch**: `001-workflows` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)
**Input**: spécification clarifiée (`specs/001-workflows/spec.md`)

## Summary

Ajouter une page Workflow et une première automatisation fournie et réglable, « Relance des invitations en attente » : après un délai tiré au hasard, retirer une invitation restée sans réponse, puis la renvoyer au moins 21 jours plus tard, en boucle (1 à 10 cycles ou sans limite). Tout passe par la file d'attente existante : une nouvelle action LinkedIn « retrait d'invitation » avec son propre quota, des réinvitations sur le quota d'invitations, un plafond quotidien par automatisation (étalement des 104 invitations anciennes), la priorité aux actions manuelles. Approche technique (détails dans [research.md](research.md)) : un moteur de décision pur appelé à chaque passage du worker, un suivi par prospect en base, l'identifiant d'invitation conservé depuis la synchronisation quotidienne, élargie à la liste entière.

## Technical Context

**Language/Version**: TypeScript strict, Node 22
**Primary Dependencies**: Next.js 16 (App Router, `cacheComponents`), Zod 4, `pg`, Supabase (Auth, Postgres 17, pg_cron) ; aucune nouvelle dépendance
**Storage**: Postgres (Supabase `qmweywmldehnsjhqexbl`) ; 2 migrations ([data-model.md](data-model.md))
**Testing**: Vitest : fonctions pures sans base, `tests/db/` sur un vrai Postgres (`TEST_DATABASE_URL`)
**Target Platform**: Vercel (production directe sur `main`), PWA iOS
**Project Type**: application web (un seul projet Next.js)
**Performance Goals**: moteur en moins de 2 s par passage du worker (226 suivis aujourd'hui, budget du worker 60 s)
**Constraints**: quotas d'un compte LinkedIn gratuit (20 invitations par jour, 100 par semaine) ; règle LinkedIn des 21 jours après retrait ; aucune limite documentée pour les retraits (plafond prudent de 10 par jour) ; retraits jamais en rafale
**Scale/Scope**: 1 utilisateur, 1 compte LinkedIn, ~230 invitations en attente, 1 automatisation dans cette itération

## Constitution Check

*Pas de constitution Spec Kit dans le dépôt : les règles de `CLAUDE.md` servent de portes.*

| Porte (`CLAUDE.md`) | Comment le plan la respecte | État |
|---|---|---|
| Spec avec rubrique sécurité ASVS niveau 1 | FR-040 à FR-043 ; R10 | ✅ |
| Plan validé avant le code | ce document, à valider | ⏳ |
| Test qui échoue d'abord, cas refusés testés | chaque tâche commence par son test ; utilisateur non connecté / non autorisé testé sur les deux actions serveur | ✅ |
| Authentification + autorisation à chaque action | `exigerUtilisateur()` sur lectures et actions ; RLS en lecture seule | ✅ |
| Entrées validées par Zod côté serveur | réglages et bascule ; bornes doublées en SQL | ✅ |
| RLS sur chaque table, testée | `automatisations`, `suivis_automatisation` : test RLS dans `tests/db/` | ✅ |
| Requêtes paramétrées | requêtes `pg` paramétrées, comme le reste | ✅ |
| Aucun secret, messages d'erreur génériques | aucun secret nouveau ; erreurs génériques, détails au journal | ✅ |
| Aucune nouvelle dépendance | aucune | ✅ |
| Migration appliquée avant le code | A puis B, appliquées via le MCP Supabase avant chaque push qui les utilise | ✅ |
| `npm run check`, build, Semgrep avant push | à chaque incrément | ✅ |
| `docs/architecture.md` à jour | à chaque incrément | ✅ |

## Project Structure

### Documentation (this feature)

```
specs/001-workflows/
├── spec.md
├── plan.md              # ce fichier
├── research.md          # décisions R1 à R10
├── data-model.md        # migrations, tables, transitions
├── contracts/
│   └── interfaces.md    # client LinkedIn, tâche, moteur, actions serveur
├── checklists/
│   └── requirements.md
└── tasks.md             # étape suivante (/tasks), après validation de ce plan
```

### Source Code (repository root)

```
supabase/migrations/
├── 20261121000000_retrait_invitation_type.sql       # A : valeur d'enum
└── 20261121000100_automatisations.sql               # B : tables, colonnes, quota, RLS, ligne de départ
src/lib/automatisations/
├── catalogue.ts            # automatisations fournies, modules, schémas Zod des réglages, défauts
└── catalogue.test.ts
src/server/automatisations/
├── relance-invitations.ts  # décisions pures (decider)
├── moteur.ts               # executerAutomatisations : suivis, mises en file, plafond, verrou
└── lecture.ts              # automatisationsDepuis : compteurs, prochaines et dernières actions
src/server/unipile/          # client-v2 (retirerInvitation, invitationId listé), executeur (retrait + effets)
src/server/queue/            # politique (quota retrait), worker (priorité 2)
src/server/mutations.ts      # basculer / régler une automatisation ; refus d'invitation < 21 jours
src/app/(app)/workflow/      # page.tsx, automatisation.tsx (encadré, réglages, compteurs)
src/components/navigation.tsx, icones-pages.tsx
src/app/(app)/reglages/ligne-tache.tsx, (app)/fiche.tsx, (app)/invitation-prospect.tsx
tests/db/                    # automatisations.test.ts, retrait.test.ts (+ ajouts invitations, worker, listes)
tests/fixtures/client-simule.ts  # retirerInvitation simulé
```

**Structure Decision**: tout reste dans le projet Next.js existant ; le moteur suit le modèle « règles pures + exécution sous verrou » de la file (`src/server/queue/`).

## Livraison par incréments

Chaque incrément est déployable seul, sans effet visible tant que l'automatisation n'est pas activée (elle est créée en pause).

| # | Incrément | Contenu | Récit |
|---|---|---|---|
| 1 | Fondations | migrations A et B ; identifiant d'invitation conservé (liste + envoi) ; lecture quotidienne des invitations envoyées sur la liste entière, disparitions constatées chaque jour | — |
| 2 | Action « retrait » | client, exécuteur et effets ; quota propre et gel ; affichage dans la file et l'historique de la fiche ; refus d'invitation manuelle à moins de 21 jours | P1 |
| 3 | Moteur et relance | décisions pures ; moteur dans le worker ; priorité 2 ; plafond quotidien ; arrêt, pause et sorties de boucle | P1 |
| 4 | Page Workflow | navigation ; encadré de l'automatisation : activer, régler, compteurs, prochaines et dernières actions ; mention « automatisation » dans la fiche | P2 |

Activation : par l'utilisateur, depuis la page Workflow, une fois l'incrément 4 en production.

## Risques

| Risque | Parade |
|---|---|
| Retraits jugés suspects par LinkedIn (aucune limite documentée) | quota propre de 10 par jour, réglable vers le bas ; gel 24 h sur 429 ou 5xx |
| Refus de retrait non documentés | 404 = déjà disparue ; 422 = échec de la seule tâche ; classement revu au premier cas réel (journal du code et du détail) |
| Identifiant envoyé ≠ identifiant listé | la liste quotidienne écrase l'identifiant ; sans identifiant, le prospect attend avec un motif visible |
| Ordre de la liste non documenté, plus de 500 invitations un jour | suite lue par décalage, comme le parcours complet existant |
| Réinvitation trop tôt (date imprécise) | délai minimal de 21 jours depuis le retrait **constaté**, revérifié par l'exécuteur ; refus « 3 semaines » = report de 7 jours, sans gel |

## Complexity Tracking

Aucune entorse aux portes : pas d'entrée.
