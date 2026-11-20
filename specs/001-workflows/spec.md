# Feature Specification: Workflows — automatisations régulières de la prospection

**Feature Branch**: `001-workflows`
**Created**: 2026-11-20
**Status**: Draft — clarifications intégrées le 2026-11-20
**Input**: User description: « Une nouvelle page Workflow, dans la barre de navigation, qui héberge plusieurs automatisations régulières alimentant la file d'attente des actions exécutées automatiquement sur mon compte LinkedIn. Chaque automatisation est construite, brique par brique, dans un éditeur d'automatisation à partir de modules. Première automatisation : après un délai variable, si mon invitation est toujours en attente d'acceptation, la retirer, puis, en boucle, la renvoyer automatiquement trois semaines plus tard — LinkedIn interdit de retirer une invitation et de la renvoyer aussitôt, et je n'ai pas en tête la date d'envoi de chaque invitation. »

## Contexte (état constaté le 2026-11-20)

- 226 invitations sont en attente d'acceptation, toutes avec une date d'envoi connue ; 104 attendent depuis plus de 3 semaines, 7 depuis plus de 60 jours (la plus ancienne date du 28 juillet 2026).
- La file d'attente (page Réglages) exécute déjà invitations, messages et lectures sous quotas, plages horaires, délais entre actions et arrêt d'urgence. Plafond actuel : 20 invitations par jour, 100 par semaine.
- Le retrait d'une invitation est possible chez le fournisseur LinkedIn (Unipile), à partir de l'identifiant de l'invitation ; cet identifiant est donné par la liste des invitations envoyées, mais n'est pas conservé aujourd'hui.
- LinkedIn refuse une nouvelle invitation à la même personne pendant 3 semaines après un retrait (refus constaté en production le 2026-11-19 : « already handled a request from you in the past 3 weeks »). Aucun signal n'est émis quand une invitation est retirée ou expire.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Relancer automatiquement les invitations restées sans réponse (Priority: P1)

Je veux que l'outil retire de lui-même une invitation restée trop longtemps en attente, puis la renvoie une fois le délai imposé par LinkedIn écoulé, sans que j'aie à suivre la date d'envoi de chaque invitation.

**Why this priority**: c'est le besoin concret qui motive la fonctionnalité : 104 invitations attendent depuis plus de 3 semaines et occupent le compte sans rien produire. Seule, cette automatisation apporte déjà toute sa valeur.

**Independent Test**: activer l'automatisation avec ses réglages par défaut sur un jeu de prospects aux invitations d'âges différents, puis vérifier, jour après jour, que seules les invitations assez anciennes sont retirées, que chacune est renvoyée après le délai de 3 semaines et jamais avant, et que tout passe par la file d'attente.

**Acceptance Scenarios**:

1. **Given** une invitation envoyée il y a plus longtemps que le délai d'attente réglé et toujours en attente, **When** l'automatisation est active, **Then** un retrait de l'invitation est mis en file d'attente, puis exécuté sous les quotas et plages horaires habituels.
2. **Given** une invitation retirée par l'automatisation, **When** le délai de réinvitation (au moins 3 semaines) est écoulé, **Then** une nouvelle invitation à la même personne est mise en file d'attente, et la boucle recommence à partir de cette nouvelle date d'envoi.
3. **Given** un prospect qui accepte l'invitation à n'importe quel moment de la boucle (avant le retrait, entre retrait et réinvitation, après la réinvitation), **When** l'acceptation est connue de l'outil, **Then** la boucle s'arrête pour lui et aucune action ne lui est plus envoyée par l'automatisation.
4. **Given** un prospect qui a atteint le nombre maximal de cycles de relance, **When** sa dernière invitation reste sans réponse, **Then** l'automatisation le laisse de côté et l'indique (aucun nouveau retrait).
5. **Given** l'automatisation active, **When** j'active l'arrêt d'urgence ou que je la mets en pause, **Then** aucune nouvelle action n'est mise en file par elle, et celles déjà en file restent visibles et annulables dans la file d'attente.

---

### User Story 2 - Page Workflow : voir, activer et suivre mes automatisations (Priority: P2)

Je veux une page Workflow dans la barre de navigation qui liste mes automatisations, me permet d'activer, de mettre en pause et de régler chacune, et me montre ce qu'elle fait : combien de prospects à chaque étape, quelles actions arrivent, ce qui a été fait.

**Why this priority**: sans suivi, une automatisation qui agit sur mon compte LinkedIn est une boîte noire ; cette page rend la P1 pilotable et accueille les automatisations suivantes.

**Independent Test**: avec l'automatisation de la P1 enregistrée, ouvrir la page Workflow, la mettre en pause, modifier son délai, la réactiver, et vérifier que les compteurs et les prochaines actions affichés correspondent à l'état réel de la file et des prospects.

**Acceptance Scenarios**:

1. **Given** la barre de navigation, **When** je l'ouvre sur ordinateur ou sur téléphone, **Then** l'entrée « Workflow » y figure et mène à la liste des automatisations.
2. **Given** une automatisation, **When** j'ouvre son détail, **Then** je vois son état (active, en pause), ses réglages, le nombre de prospects à chaque étape de sa boucle et ses prochaines actions prévues.
3. **Given** une modification de réglage (par exemple le délai d'attente), **When** je l'enregistre, **Then** elle s'applique aux décisions suivantes, sans revenir sur les actions déjà mises en file.
4. **Given** la fiche d'un prospect suivi par une automatisation, **When** je l'ouvre, **Then** son historique montre les retraits et réinvitations faits par l'automatisation, distingués de mes actions manuelles.

---

### User Story 3 - Composer une automatisation à partir de modules (Priority: P3, reportée)

> Reportée à une itération suivante (choix de l'utilisateur, 2026-11-20). Gardée ici pour que la P1 soit conçue de façon à pouvoir être reprise par l'éditeur (FR-030).

Je veux construire une nouvelle automatisation dans un éditeur, en assemblant des modules (déclencheur, attente, condition, action LinkedIn, boucle), pour ajouter d'autres automatisations brique par brique sans attendre un développement dédié.

**Why this priority**: c'est la vision à terme (« collectionner plusieurs automatisations ») ; elle n'est utile qu'une fois la mécanique éprouvée sur la P1, dont la boucle doit pouvoir s'exprimer avec ces mêmes modules.

**Independent Test**: recréer, dans l'éditeur, l'automatisation de la P1 à partir des modules disponibles, et vérifier qu'elle se comporte exactement comme la version fournie.

**Acceptance Scenarios**:

1. **Given** l'éditeur, **When** j'assemble déclencheur, attente, condition et action, **Then** l'automatisation est enregistrée seulement si son enchaînement est valide (par exemple, aucune boucle sans attente ni limite de cycles).
2. **Given** une automatisation composée, **When** je l'active, **Then** ses actions passent par la file d'attente, avec les mêmes garanties que la P1.

---

### Edge Cases

- Activation alors que de nombreuses invitations sont déjà éligibles (104 aujourd'hui) : les retraits sont étalés sur plusieurs jours sous un plafond quotidien, jamais tous le même jour (validé par l'utilisateur) ; les réinvitations correspondantes arrivent environ trois semaines plus tard, étalées de la même façon.
- Réglage « sans limite » : la boucle continue tant que le prospect n'accepte pas ; chaque cycle reste espacé d'au moins le délai d'attente plus 21 jours.
- Invitation manuelle demandée pendant le délai de réinvitation : refusée avec la date de déblocage (FR-027).
- Invitation envoyée hors de l'outil (directement sur LinkedIn) : elle est prise en charge dès que la synchronisation des invitations a fourni son identifiant ; tant qu'il manque, elle est mise de côté avec un motif visible.
- Invitation disparue de la liste LinkedIn sans acceptation (retirée à la main, expirée) : la boucle s'adapte au fait constaté (prochaine étape = réinvitation après le délai, calculé depuis la disparition constatée), sans retrait inutile.
- Retrait refusé par LinkedIn ou par le fournisseur : l'étape n'est pas considérée comme faite ; nouvel essai plus tard, sans bloquer les autres prospects.
- Réinvitation refusée pour délai de 3 semaines non écoulé (date imprécise) : reportée, jamais insistée le jour même, sans geler les autres invitations.
- Quota d'invitations du jour atteint par mes invitations manuelles : les réinvitations de l'automatisation attendent, mes invitations manuelles restent prioritaires.
- Prospect supprimé, passé à une étape terminale (Gagné, Perdu, Pas intéressé) ou qui m'a lui-même envoyé une invitation : il sort de la boucle.
- Prospect dont l'invitation est en cours d'envoi ou incertaine dans la file : aucune décision de l'automatisation tant que ce n'est pas tranché.
- Automatisation mise en pause pendant des semaines puis réactivée : les délais sont recalculés sur les dates réelles, sans rattrapage en rafale.

## Requirements *(mandatory)*

### Functional Requirements

**Page et cycle de vie**

- **FR-001**: Le système MUST proposer une page « Workflow » accessible depuis la barre de navigation (ordinateur et téléphone), qui liste les automatisations avec leur état.
- **FR-002**: Le système MUST permettre d'activer, de mettre en pause et de régler chaque automatisation ; une automatisation est en pause tant qu'elle n'a pas été activée explicitement.
- **FR-003**: Le système MUST montrer, pour chaque automatisation, le nombre de prospects à chaque étape, ses prochaines actions prévues et ses dernières actions faites.

**Automatisation « relance des invitations en attente » (P1)**

- **FR-010**: Le système MUST considérer comme éligible au retrait une invitation toujours en attente dont l'ancienneté dépasse un délai d'attente tiré au hasard, pour chaque invitation, dans une plage réglable (par défaut 21 à 28 jours).
- **FR-011**: Le système MUST revérifier, juste avant l'exécution, que l'invitation est toujours en attente ; sinon le retrait n'est pas envoyé.
- **FR-012**: Le système MUST mettre en file une nouvelle invitation à la même personne au plus tôt 21 jours après le retrait constaté, après un délai tiré au hasard dans une plage réglable dont le minimum ne peut pas descendre sous 21 jours (par défaut 21 à 25 jours).
- **FR-013**: Le nombre de cycles retrait / réinvitation par prospect MUST être un réglage de l'automatisation : un nombre choisi (1, 2, 3…, borné par un maximum) ou « sans limite » (par défaut : 2). Le nombre atteint, la dernière invitation reste en attente, le prospect est mis de côté avec le motif « relances épuisées » et l'automatisation ne lui envoie plus rien.
- **FR-014**: Le système MUST appliquer l'automatisation à toutes les invitations en attente adressées à des prospects présents dans le CRM, qu'elles aient été envoyées depuis l'outil ou directement sur LinkedIn ; une invitation en attente vers une personne absente du CRM n'est jamais touchée.
- **FR-015**: Le système MUST renvoyer la réinvitation sans note par défaut, les notes étant limitées à quelques-unes par mois sur un compte gratuit.
- **FR-016**: Le système MUST sortir un prospect de la boucle dès qu'il accepte, qu'il est supprimé, qu'il passe à une étape terminale ou qu'il envoie lui-même une invitation.

**Garanties communes à toute automatisation**

- **FR-020**: Toute action LinkedIn issue d'une automatisation MUST passer par la file d'attente, sous les mêmes quotas, plages horaires, délais entre actions, gels et arrêt d'urgence que les actions manuelles ; aucune exception.
- **FR-021**: Les actions demandées par l'utilisateur MUST rester prioritaires sur celles des automatisations.
- **FR-022**: Le retrait d'invitation MUST être une action LinkedIn à part entière, avec son propre quota (plafond quotidien réglable, borné par un maximum, par défaut 10), distinct du quota d'invitations : journalisée, annulable tant qu'elle n'est pas partie. Seules les automatisations retirent des invitations.
- **FR-023**: Les réinvitations MUST consommer le même quota que les invitations manuelles (par jour et par semaine) ; le système MUST plafonner en plus, par automatisation et par jour, le nombre de réinvitations et de retraits qu'elle met en file (réglable, par défaut 10), pour étaler l'effet d'une activation et laisser une part du quota aux invitations manuelles.
- **FR-027**: Pendant le délai de réinvitation d'un prospect (moins de 21 jours depuis le retrait), le système MUST refuser une invitation manuelle à ce prospect, avec la date à partir de laquelle elle sera possible.
- **FR-024**: Chaque action d'une automatisation MUST être tracée (automatisation d'origine, étape, date, résultat) et visible dans l'historique de la fiche du prospect et dans la file d'attente.
- **FR-025**: Une action d'automatisation MUST n'être jamais envoyée deux fois : une même étape pour un même prospect ne produit qu'une action, même si la décision est prise plusieurs fois.
- **FR-026**: Mettre en pause ou désactiver une automatisation MUST arrêter toute nouvelle mise en file ; les actions déjà en file restent visibles et annulables.

**Éditeur (P3)**

- **FR-030**: Dans cette itération, les automatisations sont fournies par l'outil et seulement réglables ; leur déroulé MUST toutefois être décrit comme un enchaînement de modules (déclencheur, attente, condition, action, boucle), pour pouvoir être repris tel quel par l'éditeur d'une itération suivante.
- **FR-031** (itération suivante) : le système refusera l'enregistrement d'un enchaînement invalide : boucle sans attente, action sans condition de sortie, délai sous le minimum imposé par LinkedIn.

**Sécurité (OWASP ASVS niveau 1)**

- **FR-040**: La page, ses lectures et chaque modification (activer, mettre en pause, régler, composer) MUST vérifier l'authentification et l'autorisation de l'utilisateur ; un utilisateur non connecté ou non autorisé n'y a aucun accès (ASVS V4).
- **FR-041**: Tout réglage et toute composition d'automatisation MUST être validés côté serveur (types, bornes, enchaînement), sans confiance dans la validation du navigateur (ASVS V5).
- **FR-042**: Aucun réglage ne MUST permettre de dépasser les plafonds du compte ou de contourner l'arrêt d'urgence ; ces limites sont aussi garanties par la base (ASVS V11, logique métier et anti-automatisation).
- **FR-043**: Les messages d'erreur affichés MUST rester génériques ; les détails (codes du fournisseur) ne vont qu'au journal serveur, sans secret ni donnée inutile (ASVS V7).

### Key Entities

- **Automatisation (workflow)** : nom, état (active, en pause), réglages, enchaînement de modules, plafond quotidien d'actions.
- **Module** : élément d'un enchaînement — déclencheur (ex. « invitation en attente »), attente (plage de délai), condition (ex. « toujours en attente »), action LinkedIn (retirer l'invitation, inviter), boucle (retour à une étape, nombre maximal de cycles).
- **Suivi d'un prospect par une automatisation** : prospect, automatisation, étape courante, cycle en cours, date de la prochaine décision, motif de mise de côté ; un prospect n'a qu'un suivi actif par automatisation.
- **Invitation envoyée** : personne invitée, date d'envoi, identifiant de l'invitation chez LinkedIn (nécessaire au retrait), origine (outil, LinkedIn direct), état (en attente, acceptée, retirée, disparue).
- **Action de retrait d'invitation** : nouvelle action LinkedIn de la file, avec son quota, son journal et ses garanties.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Une fois l'automatisation active et l'étalement initial terminé, aucune invitation ne reste en attente plus de 7 jours au-delà du délai d'attente maximal réglé.
- **SC-002**: Aucune réinvitation n'est refusée par LinkedIn pour cause de délai de 3 semaines non respecté.
- **SC-003**: Aucune action d'automatisation ne dépasse les plafonds du compte, ne part hors plage horaire ni pendant un arrêt d'urgence, et aucune n'est envoyée deux fois.
- **SC-004**: Les 104 invitations de plus de 3 semaines sont toutes retirées en moins de 3 semaines après l'activation, sans jamais plus que le plafond quotidien de retraits.
- **SC-005**: Depuis la page Workflow, je sais en moins de 30 secondes combien de prospects sont à chaque étape et quelle est la prochaine action prévue.
- **SC-006**: Le taux d'acceptation des réinvitations est mesurable et comparable à celui des premières invitations.

## Assumptions

- Un seul utilisateur et un seul compte LinkedIn gratuit, comme le reste de l'outil.
- Les dates d'envoi connues de l'outil (envois par l'outil, synchronisation des invitations envoyées, import d'archive) font foi ; la date fournie par LinkedIn est facultative et sert seulement de complément.
- Le retrait d'invitation passe par l'appel documenté du fournisseur (« Cancel a relation request ») ; ses refus ne sont pas documentés et seront classés comme ceux des invitations (refus propre à une personne : échec de la seule action ; autre refus : gel du type d'action).
- Le fournisseur ne documente aucune limite propre aux retraits : un plafond quotidien prudent est imposé par défaut (ordre de grandeur : une dizaine par jour), à confirmer à l'usage.
- Aucun signal n'arrive quand une invitation disparaît : l'état est constaté par la synchronisation des invitations envoyées, déjà quotidienne.
- Hors périmètre de cette spécification : éditeur d'automatisations (P3, itération suivante), messages générés automatiquement, relances de messages, automatisations multi-comptes, déclencheurs externes (webhooks entrants autres que LinkedIn).
- Les 226 invitations en attente concernent toutes des prospects dont l'identifiant LinkedIn est connu (vérifié le 2026-11-20) : le rattachement d'une invitation à son prospect est fiable.

## Clarifications

### Session 2026-11-20

- Q: Combien de cycles retrait / réinvitation par prospect ? → A: un réglage : 1, 2, 3… ou sans limite (FR-013).
- Q: Quelles invitations sont concernées ? → A: toutes celles adressées à des prospects du CRM, quelle que soit leur origine (FR-014).
- Q: L'éditeur de modules dès la première version ? → A: plus tard ; automatisations fournies et réglables d'abord (FR-030, User Story 3 reportée).
- Q: Activation sur les 104 invitations anciennes ? → A: étalées dans la file sous un plafond quotidien.
- Q: Les invitations manuelles partagent-elles le quota de retrait ? → A: non : les retraits ont leur propre quota ; seules les réinvitations partagent le quota d'invitations (FR-022, FR-023).
