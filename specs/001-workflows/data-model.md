# Data Model: Workflows — relance des invitations en attente

**Feature**: [spec.md](spec.md) · **Date**: 2026-11-20

Migrations appliquées au projet Supabase **avant** le code qui les utilise (`CLAUDE.md`). Deux fichiers : une nouvelle valeur d'enum ne peut pas être utilisée dans la transaction qui la crée.

## Migration A — nouvelle action LinkedIn

- `type_action` : nouvelle valeur `retrait_invitation`.

## Migration B — tables et colonnes

### Existant modifié

| Table | Changement | Règle |
|---|---|---|
| `quotas` | ligne `retrait_invitation` (plafond jour 10) ; contraintes de `type_quota` et du plafond (≤ 30) | quota distinct des invitations (FR-022) |
| `actions` | `type` accepte `retrait_invitation` (sortante) | comptée dans son quota, journalisée |
| `liens_linkedin` | colonne `invitation_id text null` (≤ 300 car.) | renseignée pour `invitation_envoyee` (R2) |
| `taches` | colonne `automatisation_id uuid null` → `automatisations(id)` on delete set null | origine visible dans la file et la fiche ; priorité 2 (R6) |

### `automatisations`

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid pk | |
| `code` | text unique | liste fermée : `relance_invitations` |
| `nom` | text | 1 à 60 caractères |
| `active` | boolean, défaut **false** | en pause tant que non activée (FR-002) |
| `reglages` | jsonb objet, ≤ 4 Ko | revalidé par Zod à la lecture et à l'écriture |
| `modules` | jsonb tableau, ≤ 8 Ko | enchaînement descriptif (FR-030), fourni par l'outil |
| `active_le`, `created_at`, `updated_at` | timestamptz | |

Ligne de départ : `relance_invitations`, inactive, réglages par défaut.

**Réglages de `relance_invitations`** (Zod, bornes aussi vérifiées en SQL) :

| Clé | Défaut | Bornes |
|---|---|---|
| `attente_jours` `{ min, max }` | 21 – 28 | 7 ≤ min ≤ max ≤ 120 |
| `reinvitation_jours` `{ min, max }` | 21 – 25 | 21 ≤ min ≤ max ≤ 90 |
| `cycles` | 2 | entier 1 à 10, ou `null` = sans limite |
| `plafond_jour` | 10 | 1 à 20 |

**Modules** (descriptif, repris par l'éditeur d'une itération suivante) : déclencheur « invitation en attente » → attente `attente_jours` → condition « toujours en attente » → action « retirer l'invitation » → attente `reinvitation_jours` → action « inviter » → boucle vers l'attente, au plus `cycles` fois.

### `suivis_automatisation`

Un suivi par prospect et par automatisation.

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid pk | |
| `automatisation_id` | uuid → `automatisations` on delete cascade | |
| `prospect_id` | uuid → `prospects` on delete cascade | suppression du prospect = fin du suivi |
| `etat` | text | `attente_retrait`, `retrait_en_file`, `attente_reinvitation`, `reinvitation_en_file`, `mis_de_cote`, `termine` |
| `cycle` | int ≥ 0 | cycles terminés (retrait + réinvitation) |
| `prochaine_decision_le` | timestamptz null | date tirée au hasard (R8) |
| `invitation_envoyee_le` | timestamptz | date de l'invitation en cours |
| `retiree_le` | timestamptz null | date du retrait constaté (FR-012, FR-027) |
| `motif` | text null | `relances_epuisees`, `identifiant_invitation_inconnu`, `etape_terminale`, `accepte`, `invitation_recue` |
| `created_at`, `updated_at` | timestamptz | |

Contrainte unique `(automatisation_id, prospect_id)`. Index sur `(etat, prochaine_decision_le)`.

### Transitions d'un suivi

```
(nouvelle invitation en attente d'un prospect du CRM)
        → attente_retrait          prochaine_decision_le = envoi + tirage(attente_jours)
attente_retrait ── échéance, toujours en attente, identifiant connu, plafond libre ──→ retrait_en_file
attente_retrait ── identifiant d'invitation inconnu ──→ attente_retrait (motif visible, réessai au passage suivant)
retrait_en_file ── retrait réussi (ou 404 : déjà disparue) ──→ attente_reinvitation   retiree_le, prochaine = retrait + tirage(reinvitation_jours ≥ 21)
attente_reinvitation ── échéance, plafond libre ──→ reinvitation_en_file
reinvitation_en_file ── invitation envoyée ──→ attente_retrait  (cycle + 1 ; si cycle = cycles → mis_de_cote « relances_epuisees »)
n'importe quel état ── acceptation / étape terminale / invitation reçue ──→ termine (motif)
n'importe quel état ── prospect supprimé ──→ (suivi supprimé)
```

Une tâche annulée à la main dans la file ramène le suivi à l'état d'attente précédent, avec une nouvelle échéance tirée.

## Droits

- RLS activée sur `automatisations` et `suivis_automatisation` ; `select` pour `authenticated` sous `private.est_autorise()` ; aucune écriture depuis l'interface ; `anon` sans droit.
- Les colonnes ajoutées à `taches` et `liens_linkedin` n'ouvrent aucun droit d'écriture nouveau à l'interface.
