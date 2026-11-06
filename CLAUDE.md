# OutreachLinkedIn

@AGENTS.md

Next.js 16 (App Router, TypeScript strict) sur Vercel, base Supabase. Node 22.
Architecture et décisions : @docs/architecture.md

## Commandes
- `npm run check` : lint + typage + tests. À lancer avant de rendre la main.
- `npm run build` : build de production.
- `npm test` : Vitest (fichiers `*.test.ts` dans `src/` et `tests/`).

## Méthode
- Une tâche = une branche = une PR. Jamais de push sur `main`.
- Cycle : spec (avec rubrique sécurité, ASVS niveau 1) → plan validé par l'utilisateur → tâches courtes → test qui échoue d'abord → code → relecture critique → PR.
- Tester aussi les cas refusés : utilisateur non connecté, autre utilisateur que le propriétaire.

## Sécurité — règles non négociables
- Appliquer le skill `software-security` (Project CodeGuard, `.claude/skills/software-security/`) dès qu'on écrit ou modifie du code.
- Aucun secret dans le code, les logs, les tests ou les messages de commit. Secrets uniquement via variables d'environnement. Ne jamais lire `.env*` (sauf `.env.example`).
- Seules les variables `NEXT_PUBLIC_` vont côté client, et jamais une clé privée (clé secrète Supabase, clés API tierces). Le code qui utilise une clé privée importe `server-only`.
- Toute entrée utilisateur est validée côté serveur avec un schéma Zod. Ne jamais faire confiance à la validation client.
- Chaque route, Server Action ou endpoint vérifie l'authentification ET l'autorisation (cet utilisateur a-t-il le droit sur cette ressource ?).
- Supabase : RLS activée sur chaque table, avec des politiques testées. La clé secrète ne sert qu'à du code serveur qui en a strictement besoin.
- Requêtes en base paramétrées ou via le client Supabase. Jamais de concaténation de chaînes.
- Ne pas réinventer l'auth, la crypto ou les sessions : utiliser Supabase Auth.
- Avant d'ajouter une dépendance : vérifier qu'elle existe, qu'elle est maintenue et très utilisée. La signaler dans la PR.
- Messages d'erreur génériques côté utilisateur, détails dans les logs serveur uniquement.
- Marquer d'un `TODO(security)` tout point incertain plutôt que de deviner.
- Ne pas modifier `.claude/`, `.github/` ni `.pre-commit-config.yaml` sans demande explicite : ce sont les garde-fous du projet.

## Avant de rendre la main
- `npm run check` vert, et scan Semgrep via le MCP `semgrep` sur les fichiers modifiés ; corriger ce qui remonte.
- Relire son propre diff en cherchant les failles, puis corriger.
- Mettre à jour `docs/architecture.md` si la structure a changé.
