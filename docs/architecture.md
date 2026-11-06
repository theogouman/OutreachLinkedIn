# Architecture

Mémoire du projet, tenue à jour par l'agent à chaque changement structurant.

## Stack
- Next.js 16, App Router, TypeScript strict, Tailwind 4. Node 22 (`.nvmrc`, `engines`).
- Supabase (base Postgres + Auth). Clients pas encore ajoutés : à créer avec la première fonctionnalité qui en a besoin, en suivant le guide Next.js de `@supabase/ssr`.
- Validation : Zod 4. Tests : Vitest.
- Hébergement : Vercel. `main` = production, chaque PR = preview.

## Arborescence
- `src/app/` : routes (App Router).
- `src/lib/env.ts` : lecture validée des variables publiques. Les variables privées seront lues dans un module serveur séparé qui importe `server-only`.
- `tests/` : tests hors application (garde-fous de l'agent).
- `next.config.ts` : en-têtes de sécurité (CSP, HSTS, etc.).

## Garde-fous
| Couche | Où | Bloquant |
|---|---|---|
| Règles agent | `CLAUDE.md`, skill `software-security` (CodeGuard) | Non |
| Méthode | Plugin Superpowers (activé dans `.claude/settings.json`) | Non |
| Permissions et hooks | `.claude/settings.json`, `.claude/hooks/` (testés par `tests/claude-hooks.test.ts`) | Oui, sur la machine |
| Pre-commit | `.pre-commit-config.yaml` : Gitleaks, ESLint | Oui, au commit |
| CI | `.github/workflows/ci.yml` : tests/lint/typage/build, Gitleaks, Semgrep, OSV-Scanner | Oui, au merge |
| Revue IA | `.github/workflows/security-review.yml` | Non, commentaires |

## Décisions
- 2026-11-06 — CodeGuard installé comme skill (chargé à la demande) plutôt que dans `.claude/rules/` (≈100 Ko chargés à chaque session).
- 2026-11-06 — CSP sans nonce : compatible avec le rendu statique et `cacheComponents`. Passer à une CSP à nonce si l'app charge des scripts tiers.
- 2026-11-06 — `overrides` sur `minimatch` (^11.0.5) sous `@typescript-eslint/typescript-estree` pour corriger GHSA-g3hv-75wg-m249 (dev uniquement). À retirer quand typescript-eslint l'intègre.
