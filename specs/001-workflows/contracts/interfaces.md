# Contracts: Workflows — relance des invitations en attente

**Feature**: [spec.md](spec.md) · **Date**: 2026-11-20

## 1. Client LinkedIn (`src/server/unipile/types.ts`)

```ts
// Nouveau : retrait d'une invitation envoyée (R1).
retirerInvitation(invitationId: string): Promise<Resultat<{ dejaDisparue: boolean }>>;
// 200 RelationRequestCanceled → { ok: true, dejaDisparue: false }
// 404                         → { ok: true, dejaDisparue: true }   (constat, pas un échec)
// autres refus                → { ok: false, erreur }                (classés par la politique de la file)

// Modifié : chaque invitation listée porte son identifiant (R2).
interface PersonneListee { /* … */ invitationId?: string | null }
// Modifié : l'identifiant renvoyé à l'envoi est transmis aux effets (aujourd'hui ignoré).
inviter(providerId, note?): Promise<Resultat<{ invitationId: string | null }>>; // inchangé, désormais exploité
```

Réponses validées par Zod (`RelationRequestCanceled`), identifiant borné (1 à 300 caractères), jamais journalisé avec une donnée personnelle.

## 2. Tâche de file `retrait_invitation`

- Payload : `{ prospect_id: uuid }` — l'identifiant d'invitation est relu en base juste avant l'appel (jamais figé dans la tâche).
- Exécuteur : revérifie que le prospect est toujours « en attente » et que l'identifiant est connu ; sinon rien n'est envoyé (`deja_en_relation`, `plus_en_attente`, `identifiant_invitation_inconnu`).
- Effets (même transaction que la clôture) : lien `invitation_envoyee` retiré, statut recalculé, suivi passé à `attente_reinvitation` avec `retiree_le`, journal `retrait_invitation` sortant (avec l'automatisation d'origine dans `details`).

## 3. Moteur (`src/server/automatisations/`)

```ts
// Pur, testé sans base (modèle politique.ts).
decider(suivi: Suivi, faits: FaitsProspect, reglages: ReglagesRelance, maintenant: Date, aleatoire: () => number): Decision;
// Decision = { mettreEnFile: "retrait" | "invitation" | null; suivant: Partial<Suivi> }

// Un passage, appelé par /api/worker/tick avant le tour de file (mode réel seulement).
executerAutomatisations(pool: Pool, maintenant: Date, aleatoire?: () => number): Promise<BilanAutomatisations>;
// BilanAutomatisations = { suivisCrees: number; tachesMisesEnFile: number; misDeCote: number; plafondAtteint: boolean }
```

Garanties : verrou consultatif propre ; rien si l'automatisation est en pause ou si l'arrêt d'urgence est actif ; clé d'idempotence `auto:{code}:{prospect}:{cycle}:{action}` ; plafond quotidien compté en heure de Paris.

## 4. Actions serveur (`src/app/actions.ts`)

Toutes : `exigerUtilisateur()`, entrée validée par Zod côté serveur, message générique en cas d'erreur, détails au journal serveur seulement.

| Action | Entrée | Effet |
|---|---|---|
| `actionBasculerAutomatisation` | `{ id: uuid, active: boolean }` | active ou met en pause ; en pause, plus aucune mise en file (les tâches déjà en file restent annulables) |
| `actionReglerAutomatisation` | `{ id: uuid, reglages: ReglagesRelance }` | enregistre des réglages bornés ; s'appliquent aux décisions suivantes seulement |

Lecture (`src/server/donnees.ts`, derrière `exigerUtilisateur()`) : `automatisations()` → pour chacune : état, réglages, compteurs par état de suivi, 10 prochaines actions (date, prospect, action), 10 dernières actions faites.

## 5. Invitation manuelle (modifié)

`mettreInvitationEnFile` refuse (`EnvoiRefuse`) une invitation à un prospect retiré depuis moins de 21 jours : « LinkedIn refuse une nouvelle invitation avant le {date} ». La fiche affiche la même date et grise le bouton.
