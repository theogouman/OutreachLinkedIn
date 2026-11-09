# Mise en place — étapes manuelles

Ce que le code du repo ne peut pas configurer seul. À faire une fois, dans cet ordre.

## Outillage de l'agent (sessions Claude Code)
Pas d'environnement local pour l'application : elle tourne uniquement en production sur Vercel.
1. Pre-commit : `pipx install pre-commit` (ou `brew install pre-commit`), puis `pre-commit install`.
2. Semgrep pour le MCP de l'agent : `pipx install semgrep` (ou `brew install semgrep`). Le serveur `semgrep` de `.mcp.json` est déjà autorisé dans `.claude/settings.json`.
3. Superpowers : le plugin est activé dans `.claude/settings.json` ; à la première session, accepter l'installation (sinon `/plugin install superpowers@claude-plugins-official`).
4. Skills de l'éditeur, au niveau utilisateur : `vercel-labs/agent-skills` et `supabase/agent-skills`.
5. Autonomie longue (mode bypass) : uniquement dans le devcontainer `trailofbits/claude-code-devcontainer`, jamais directement sur la machine.

## Connexion Google (Supabase Auth)
Projet Supabase : `qmweywmldehnsjhqexbl` (région eu-central-1). Seules les adresses de la table
`utilisateurs_autorises` peuvent se connecter ; la liste se gère en base, pas dans le code.

1. **Google Cloud Console** → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized JavaScript origins : `https://outreach.gouman.fr`.
   - Authorized redirect URIs : `https://qmweywmldehnsjhqexbl.supabase.co/auth/v1/callback`.
   - Écran de consentement : type « Externe », statut « En test », avec les deux adresses autorisées comme utilisateurs de test.
2. **Supabase** → Authentication → Sign In / Providers → Google : activer, coller le Client ID et le Client Secret.
3. **Supabase** → Authentication → URL Configuration :
   - Site URL : `https://outreach.gouman.fr`.
   - Redirect URLs : `https://outreach.gouman.fr/**` (le `/**` couvre `/auth/callback?retour=…`).
4. **Supabase** → Authentication → Hooks → *Before User Created* → type Postgres → `public.hook_avant_creation_utilisateur`.
   Ce hook refuse la création de tout compte hors liste. Les inscriptions restent donc **activées** :
   la première connexion Google d'une adresse autorisée crée son compte, toute autre est refusée.

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
- URL : **https://outreach.gouman.fr** (CNAME `outreach` → `2ba026043f4deb2b.vercel-dns-017.com.` dans la zone Hostinger
  de gouman.fr). Alias : https://outreach-gouman.vercel.app, https://outreach-linkedin-eta.vercel.app.
- Worker : `cron.job` « worker-tick » (Supabase pg_cron) appelle `/api/worker/tick` chaque minute avec le secret
  `worker_secret` du coffre Supabase (Vault). Tant que `WORKER_SECRET` n'est pas défini dans Vercel, la route répond 503.
- Variables Vercel (Settings → Environment Variables). Déjà renseignées : `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `UNIPILE_MODE=simule`. Pré-créées en *Sensitive* (Production) avec la valeur
  `A_REMPLIR`, volontairement invalide (la route concernée refuse tout tant qu'elle n'est pas remplacée) :

  | Variable | Où la trouver |
  |---|---|
  | `DATABASE_URL` | Supabase → Connect → Transaction pooler (mot de passe de la base inclus, sans `sslmode`) |
  | `DATABASE_CA_CERT` | Supabase → Project Settings → Database → SSL Configuration → Download certificate (contenu PEM) |
  | `WORKER_SECRET` | Supabase → Project Settings → Vault → `worker_secret` (afficher la valeur) |
  | `UNIPILE_API_KEY` | Dashboard Unipile → API Keys (v2) |
  | `UNIPILE_ACCOUNT_ID` | Dashboard Unipile → Accounts → compte LinkedIn (`acc_…`) |
  | `UNIPILE_SERVICE_KEY` | Dashboard Unipile → application → API Keys → onglet Service Keys (rôle `service`, créée par un Owner/Admin). Sert uniquement à lire le secret de signature des webhooks, que le tableau de bord n'affiche pas |
  | `UNIPILE_WEBHOOK_SECRET` | Dashboard Unipile → Webhooks → endpoint `https://outreach.gouman.fr/api/webhooks/unipile` |

  Passer `UNIPILE_MODE` à `reel` seulement quand les trois `UNIPILE_*` sont remplis. Redéployer après chaque modification.

## Vercel
1. Importer le repo. Production Branch = `main`. Ne jamais déployer en CLI.
2. Variables d'environnement séparées Production / Preview / Development. Previews sur un projet Supabase de test. Clés privées marquées *Sensitive*.
3. **Deployment Protection** : Vercel Authentication activée sur les previews.
4. **Firewall** : règles gérées activées, rate limiting sur connexion, inscription, formulaires et API publiques (à poser avec la première route concernée).
5. Node.js Version = 22.x (lu aussi depuis `engines`).

## Vérification finale
Ouvrir une PR « test » contenant un faux secret et une requête SQL concaténée, vérifier que `Secrets (Gitleaks)` et `Analyse statique (Semgrep)` échouent, puis fermer la PR sans merger et supprimer la branche.
