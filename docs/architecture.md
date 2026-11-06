# Architecture

Mémoire du projet, tenue à jour par l'agent à chaque changement structurant.
Plan et décisions produit : [plan-v1.md](plan-v1.md).

## Stack
- Next.js 16, App Router, TypeScript strict, Tailwind 4, `cacheComponents` activé. Node 22 (`.nvmrc`, `engines`).
- Supabase (projet `qmweywmldehnsjhqexbl`, Postgres 17) : base, Auth (Google OAuth), plus tard Realtime et pg_cron.
- Validation : Zod 4. Tests : Vitest, dont tests sur un vrai Postgres (`tests/db/`, `TEST_DATABASE_URL`).
- Hébergement : Vercel. `main` = production, chaque PR = preview.

## Arborescence
- `src/app/` : routes. `login/` (bouton Google), `auth/callback/` (échange PKCE), `page.tsx` (accueil protégé).
- `src/proxy.ts` : rafraîchit la session Supabase, renvoie vers `/login` sans session. Routes publiques : `/login`, `/auth/callback`, `/api/worker/*`, `/api/webhooks/*` (authentifiées par secret / signature dans la route).
- `src/server/auth.ts` : `exigerUtilisateur()` — session (`getClaims`) + autorisation (RLS : la ligne `reglages` n'est visible que d'une adresse autorisée).
- `src/lib/supabase/` : clients navigateur et serveur (`@supabase/ssr`).
- `src/components/interface/` : composants adaptés des dépôts de design (jauge, panneau latéral, notifications, zone de dépôt), notices dans `THIRD_PARTY_NOTICES.md`. `motion` épinglé (14.6.0), `MotionConfig reducedMotion="user"` à la racine.
- `src/app/(app)/` : écrans protégés (prospects + fiche en panneau `?prospect=id`, file, import, réglages) ; `src/server/donnees.ts` et `mutations.ts` derrière `exigerUtilisateur()`.
- `src/server/queue/` : `temps.ts` (heure de Paris), `politique.ts` (règles pures), `worker.ts` (un tour de file, connexion directe `pg`), `planification.ts` (une lecture par liste et par jour, heure aléatoire).
- `src/server/unipile/` : `client-v2.ts` (API v2, réponses validées par Zod), `simule.ts` (aucun appel réseau), `executeur.ts` (tâche → appel → effets en base), `fabrique.ts` (`UNIPILE_MODE`).
- `src/server/demo.ts` : données de démonstration (prospects fictifs `demo-…`, colonne `prospects.demo`), chargement et purge depuis Réglages. Avec `UNIPILE_MODE=simule`, le worker ne traite que les tâches de démo (`seulementDemo`) : un vrai prospect n'obtient jamais de faux identifiant.
- `src/server/import/` : lecture des CSV (archive LinkedIn, export Notion) et écriture en base.
- `src/server/relations.ts` : liens LinkedIn connus, recalcul des statuts, acceptations.
- `src/server/webhooks/unipile.ts` : signature, idempotence, `relation.new`.
- `src/server/db.ts`, `env-serveur.ts`, `secrets.ts` : connexion Postgres (TLS vérifié), variables privées, comparaisons à temps constant.
- `src/app/api/worker/tick` (secret Bearer) et `src/app/api/webhooks/unipile` (signature HMAC) : routes minces.
- `src/lib/` : `env.ts`, `linkedin-url.ts`, `statut-relation.ts`, `redirection.ts`.
- `supabase/migrations/` : SQL versionné, appliqué au projet via le MCP Supabase. `supabase/tests/bootstrap.sql` : rôles et `auth.jwt()` simulés pour les tests.
- `next.config.ts` : en-têtes de sécurité (CSP, HSTS, etc.).

## Accès
- Connexion Google uniquement. Liste d'adresses dans `utilisateurs_autorises` (en base, hors repo).
- Hook Auth `before-user-created` : aucun compte créé hors liste.
- RLS sur toutes les tables via `private.est_autorise()` (schéma non exposé par l'API). `anon` n'a aucun droit.
- Droits par colonne : l'interface ne peut ni lever un gel, ni avancer l'espacement, ni écrire dans le journal.
- Les sessions ne sont lues que sous `<Suspense>` (exigence `cacheComponents`).

## Garde-fous
| Couche | Où | Bloquant |
|---|---|---|
| Règles agent | `CLAUDE.md`, skill `software-security` (CodeGuard) | Non |
| Méthode | Plugin Superpowers (activé dans `.claude/settings.json`) | Non |
| Permissions et hooks | `.claude/settings.json`, `.claude/hooks/` (testés par `tests/claude-hooks.test.ts`) | Oui, sur la machine |
| Pre-commit | `.pre-commit-config.yaml` : Gitleaks, ESLint | Oui, au commit |
| CI | `.github/workflows/ci.yml` : tests (avec Postgres)/lint/typage/build, Gitleaks, Semgrep, OSV-Scanner | Oui, au merge |
| Revue IA | `.github/workflows/security-review.yml` | Non, commentaires |

## Décisions
- 2026-11-06 — Branche `main` créée (accord de l'utilisateur) ; évolutions suivantes par PR.
- 2026-11-06 — CodeGuard installé comme skill (chargé à la demande) plutôt que dans `.claude/rules/` (≈100 Ko chargés à chaque session).
- 2026-11-06 — CSP sans nonce : compatible avec le rendu statique et `cacheComponents`. Passer à une CSP à nonce si l'app charge des scripts tiers.
- 2026-11-06 — `overrides` sur `minimatch` (^11.0.5) sous `@typescript-eslint/typescript-estree` pour corriger GHSA-g3hv-75wg-m249 (dev uniquement). À retirer quand typescript-eslint l'intègre.
- 2026-11-06 — Worker : décision et réservation en TypeScript dans une transaction `pg` sous verrou consultatif, plutôt qu'en fonction SQL, pour tester les mêmes règles sans base.
- 2026-11-06 — Autorisation applicative déduite de la RLS (une seule liste, en base) plutôt que d'une variable d'environnement.
- 2026-11-06 — Connexion Google lancée côté navigateur (`signInWithOAuth`) : évite que la CSP `form-action 'self'` bloque la redirection vers Google après un formulaire.
