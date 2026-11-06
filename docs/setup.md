# Mise en place — étapes manuelles

Ce que le code du repo ne peut pas configurer seul. À faire une fois, dans cet ordre.

## Poste de travail
1. Node 22 (`nvm use`), puis `npm ci`.
2. `cp .env.example .env.local` et remplir avec des clés Supabase de **développement**.
3. Pre-commit : `pipx install pre-commit` (ou `brew install pre-commit`), puis `pre-commit install`.
4. Semgrep pour le MCP de l'agent : `pipx install semgrep` (ou `brew install semgrep`). Le serveur `semgrep` de `.mcp.json` est déjà autorisé dans `.claude/settings.json`.
5. Superpowers : le plugin est activé dans `.claude/settings.json` ; à la première session, accepter l'installation (sinon `/plugin install superpowers@claude-plugins-official`).
6. Skills de l'éditeur, au niveau utilisateur : `vercel-labs/agent-skills` et `supabase/agent-skills`.
7. Autonomie longue (mode bypass) : uniquement dans le devcontainer `trailofbits/claude-code-devcontainer`, jamais directement sur la machine.

## Connexion Google (Supabase Auth)
Projet Supabase : `qmweywmldehnsjhqexbl` (région eu-central-1). Seules les adresses de la table
`utilisateurs_autorises` peuvent se connecter ; la liste se gère en base, pas dans le code.

1. **Google Cloud Console** → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized JavaScript origins : `http://localhost:3000` et l'URL de production Vercel.
   - Authorized redirect URIs : `https://qmweywmldehnsjhqexbl.supabase.co/auth/v1/callback`.
   - Écran de consentement : type « Externe », statut « En test », avec les deux adresses autorisées comme utilisateurs de test.
2. **Supabase** → Authentication → Sign In / Providers → Google : activer, coller le Client ID et le Client Secret.
3. **Supabase** → Authentication → URL Configuration :
   - Site URL : l'URL de production Vercel.
   - Redirect URLs : `http://localhost:3000/auth/callback`, `https://<domaine-prod>/auth/callback`.
4. **Supabase** → Authentication → Hooks → *Before User Created* → type Postgres → `public.hook_avant_creation_utilisateur`.
   Ce hook refuse la création de tout compte hors liste. Les inscriptions restent donc **activées** :
   la première connexion Google d'une adresse autorisée crée son compte, toute autre est refusée.
5. `.env.local` : `NEXT_PUBLIC_SUPABASE_URL=https://qmweywmldehnsjhqexbl.supabase.co` et
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Dashboard → Project Settings → API Keys, clé `sb_publishable_…`).

## GitHub (Settings du repo)
1. **Rulesets → New branch ruleset** sur `main` : *Restrict deletions*, *Block force pushes*, *Require a pull request before merging*, *Require status checks to pass* avec « branche à jour » cochée. Checks requis :
   - `Tests, lint, typage, build`
   - `Secrets (Gitleaks)`
   - `Analyse statique (Semgrep)`
   - `Dépendances (OSV-Scanner)`
   Les checks n'apparaissent dans la liste qu'après une première exécution de la CI.
2. **Code security** : Dependabot alerts et Dependabot security updates activés. Secret scanning + push protection si le repo est public (ou si GitHub Secret Protection est payé) ; sinon Gitleaks couvre.
3. **Actions → General** : *Workflow permissions* = « Read repository contents ». *Fork pull request workflows* : exiger l'approbation pour les contributeurs externes.
4. **Secrets and variables → Actions** : secret `ANTHROPIC_API_KEY` (clé dédiée à la revue sécurité, plafond de dépense bas). Variable optionnelle `SECURITY_REVIEW_MODEL` pour choisir le modèle ; vide = défaut de l'action.

## Production (déployée le 2026-11-06)
- Projet Vercel `outreach-linkedin` (équipe Notion Club), fonctions en `fra1` (proche de Supabase eu-central-1), Node 22.
- URL : https://outreach-linkedin-eta.vercel.app (alias https://outreach-linkedin-g0uman.vercel.app).
- Worker : `cron.job` « worker-tick » (Supabase pg_cron) appelle `/api/worker/tick` chaque minute avec le secret
  `worker_secret` du coffre Supabase (Vault). Tant que `WORKER_SECRET` n'est pas défini dans Vercel, la route répond 503.
- Variables Vercel à ajouter à la main (Settings → Environment Variables, type *Sensitive*, Production) :
  `DATABASE_URL`, `DATABASE_CA_CERT`, `WORKER_SECRET` (valeur : Supabase → Vault → `worker_secret`),
  puis plus tard `UNIPILE_*`. Redéployer après ajout.

## Vercel
1. Importer le repo. Production Branch = `main`. Ne jamais déployer en CLI.
2. Variables d'environnement séparées Production / Preview / Development. Previews sur un projet Supabase de test. Clés privées marquées *Sensitive*.
3. **Deployment Protection** : Vercel Authentication activée sur les previews.
4. **Firewall** : règles gérées activées, rate limiting sur connexion, inscription, formulaires et API publiques (à poser avec la première route concernée).
5. Node.js Version = 22.x (lu aussi depuis `engines`).

## Vérification finale
Ouvrir une PR « test » contenant un faux secret et une requête SQL concaténée, vérifier que `Secrets (Gitleaks)` et `Analyse statique (Semgrep)` échouent, puis fermer la PR sans merger et supprimer la branche.
