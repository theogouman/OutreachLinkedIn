# Architecture

Mémoire du projet, tenue à jour par l'agent à chaque changement structurant.
Plan et décisions produit : [plan-v1.md](plan-v1.md).

## Stack
- Next.js 16, App Router, TypeScript strict, Tailwind 4, `cacheComponents` activé. Node 22 (`.nvmrc`, `engines`).
- Supabase (projet `qmweywmldehnsjhqexbl`, Postgres 17) : base, Auth (Google OAuth), plus tard Realtime et pg_cron.
- Validation : Zod 4. Tests : Vitest, dont tests sur un vrai Postgres (`tests/db/`, `TEST_DATABASE_URL`).
- Hébergement : Vercel. Branche de production : `claude/confident-ritchie-6v4383` ; chaque push part en production, sans PR.

## Arborescence
- `src/app/` : routes. `login/` (bouton Google), `auth/callback/` (échange PKCE), `page.tsx` (accueil protégé).
- `src/proxy.ts` : rafraîchit la session Supabase, renvoie vers `/login` sans session. Routes publiques (`src/lib/routes-publiques.ts`, testé) : `/login`, `/auth/callback`, `/api/worker/*`, `/api/webhooks/*` (authentifiées par secret / signature dans la route), `/manifest.webmanifest`, `/sw.js`.
- PWA iOS (modèle Notion-Club/Infrastructure) : `src/app/manifest.ts`, balises Apple et 11 écrans de lancement dans `src/app/layout.tsx` (`src/lib/pwa-ios.ts`), logo `public/logo-glow.svg` (composant `src/components/logo.tsx` en ligne, couleur `currentColor` : noir sur fond clair ; favicon `src/app/icon.svg` noir ou blanc selon le thème du navigateur ; icônes PWA noires sur #f5f2f2), icônes `public/icons`, splash `public/splash` (régénérés par `scripts/generer-*.mjs`), `public/sw.js` enregistré en production, en-têtes dans `next.config.ts`. Marges `env(safe-area-inset-*)` car la barre d'état est transparente.
- `src/server/auth.ts` : `exigerUtilisateur()` — session (`getClaims`) + autorisation (RLS : la ligne `reglages` n'est visible que d'une adresse autorisée).
- `src/lib/supabase/` : clients navigateur et serveur (`@supabase/ssr`).
- `src/components/interface/` : composants adaptés des dépôts de design (jauge, panneau latéral, notifications, zone de dépôt, table triable, compteur), éléments communs (`elements.tsx` : en-tête de page, avatar, état vide, squelettes), notices dans `THIRD_PARTY_NOTICES.md`.
- Recherche des prospects en temps réel (`(app)/recherche-prospects.tsx`) : filtrage instantané des lignes affichées à chaque caractère, puis URL `?q=` mise à jour 200 ms après la dernière frappe (transition, résultat exact du serveur sur toute la base). Une seule règle (`src/lib/recherche.ts` : tous les mots, n'importe quel ordre, sans casse ni accents) appliquée côté navigateur et en SQL (`translate`/`position`, sans LIKE). Lignes qui entrent et sortent animées (`table-triable.tsx`).
- Statistiques (`(app)/statistiques`) : entonnoir par étape (`entonnoirDepuis`) et carte de chaleur de l'activité (`activiteDepuis`, actions LinkedIn réussies par jour de Paris), graphiques bklit copiés dans `src/components/charts/` (règles de lint assouplies sur ce seul dossier, `eslint.config.mjs`).
- Barre de navigation : pilule de l'onglet actif placée par mesure (offsetLeft/offsetTop de l'élément de liste) et déplacée en transform CSS, sans `layoutId` : l'animation partagée de motion mesurait en coordonnées de page et faisait remonter la pilule depuis la position de défilement. Même graisse pour tous les onglets (pas de décalage au changement).
- Barre de navigation : menu Statuts (`menu-statuts.tsx`, point clignotant à la couleur de la file, ouvert au survol, au focus ou au toucher) avec quotas, mode démo et arrêt d'urgence.
- Système visuel : DA Notion Club (dépôt Notion-Club/Infrastructure : brand #e0625a, page #f5f2f2 à taches latérales, cartes 24 px, boutons en pilule sombre, navigation en pilule flottante en haut et barre de pouce en bas sur mobile), contrôlée avec anti-slop et unslop (heydamir, CC BY 4.0) : fond uni sans lavis, graisses 400 à 500, casse de phrase, pas de point final sur les légendes, icônes 16/18 px de la couleur du texte, cartes d'indicateurs sans icône, une seule courbe ease-out sans ressort. Jetons de couleur et styles de texte nommés dans `src/app/globals.css` (`@theme`, `@utility` : `carte`, `bouton*`, `champ`, `heading-5`, `body-6`…) ; ne pas écrire de couleurs en dur. Icônes Phosphor dans `src/components/icones.tsx` (pas les SF Symbols du dépôt NC : licence Apple limitée aux plateformes Apple), logos de marque en ligne dans `src/components/logos.tsx`, navigation latérale dans `src/components/navigation.tsx`. `motion` épinglé (14.6.0), `MotionConfig reducedMotion="user"` à la racine.
- `src/app/(app)/` : écrans protégés (prospects + fiche en panneau `?prospect=id`, file, statistiques, import, réglages) ; `src/server/donnees.ts` et `mutations.ts` derrière `exigerUtilisateur()`.
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
- 2026-11-08 — Entonnoir : étapes non terminales puis la première étape terminale (Gagné) ; les autres terminales sont des sorties. Un prospect compte à chaque étape atteinte, d'après son étape actuelle et le journal des changements d'étape.
- 2026-11-08 — Composants bklit copiés à la main depuis le registre plutôt que via la CLI shadcn, qui aurait réécrit `globals.css` avec ses propres variables.
- 2026-11-07 — Service worker limité aux fichiers statiques : contrairement au modèle NC, les pages HTML ne sont pas mises en cache (aucune donnée de prospect conservée sur l'appareil après déconnexion). Zoom laissé actif (accessibilité) ; l'auto-zoom iOS est évité par des champs à 16 px sur mobile.
- 2026-11-07 — Lien « Ouvrir son LinkedIn » reconstruit par `lienProfilLinkedIn()` depuis l'identifiant validé (jamais l'URL stockée telle quelle) : aucun autre domaine ni schéma possible.
- 2026-11-07 — Boutons d'action en pilule sombre plutôt que rouge brand : le blanc sur #e0625a ne passe pas le contraste AA (3,4:1).
- 2026-11-07 — Règle de l'utilisateur : déploiement direct en production à chaque push, pas de PR. `main` n'est plus utilisée.
- 2026-11-06 — CodeGuard installé comme skill (chargé à la demande) plutôt que dans `.claude/rules/` (≈100 Ko chargés à chaque session).
- 2026-11-06 — CSP sans nonce : compatible avec le rendu statique et `cacheComponents`. Passer à une CSP à nonce si l'app charge des scripts tiers.
- 2026-11-06 — `overrides` sur `minimatch` (^11.0.5) sous `@typescript-eslint/typescript-estree` pour corriger GHSA-g3hv-75wg-m249 (dev uniquement). À retirer quand typescript-eslint l'intègre.
- 2026-11-06 — Worker : décision et réservation en TypeScript dans une transaction `pg` sous verrou consultatif, plutôt qu'en fonction SQL, pour tester les mêmes règles sans base.
- 2026-11-06 — Autorisation applicative déduite de la RLS (une seule liste, en base) plutôt que d'une variable d'environnement.
- 2026-11-06 — Connexion Google lancée côté navigateur (`signInWithOAuth`) : évite que la CSP `form-action 'self'` bloque la redirection vers Google après un formulaire.
