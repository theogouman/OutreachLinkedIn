# Research: Workflows — relance des invitations en attente

**Feature**: [spec.md](spec.md) · **Date**: 2026-11-20

Chaque point : décision, raison, alternatives écartées. Sources fournisseur lues le 2026-11-20.

## R1 — Retrait d'une invitation chez Unipile

- **Décision** : `POST /v2/{account_id}/users/me/relation-requests/{request_id}/cancel`, sans corps → 200 `{ "object": "RelationRequestCanceled" }`. `request_id` = identifiant de l'invitation (champ `id` de la liste des invitations envoyées).
- **Sources** : developer.unipile.com/v2.0/reference/cancelrelationrequest ; guide « LinkedIn – Manage invitations » (son exemple curl finit par `/accept` : erreur de la page, la référence fait foi).
- **Inconnues** : aucun code d'erreur documenté, aucune limite propre aux retraits, aucun webhook de retrait ou d'expiration. `TODO(security)` dans le client, comme pour l'envoi d'invitation.
- **Classement des refus** (politique de la file) : 404 → invitation déjà disparue : constat, pas d'échec (la boucle passe au délai de réinvitation) ; 422 → échec de la seule tâche, sans gel ; 429 et 5xx → gel 24 h du seul type « retrait » (sans effet sur invitations et messages) ; pas de réponse → incertaine (jamais renvoyée seule), comme toute action.
- **Alternatives écartées** : `DELETE /api/v1/users/invite/sent/{id}` (v1, vue seulement sur des miroirs tiers, non confirmée ; le reste de l'outil est en v2).

## R2 — Identifiant de l'invitation

- **Décision** : conserver l'identifiant d'invitation sur le lien LinkedIn connu (`liens_linkedin`, type `invitation_envoyee`), renseigné par la synchronisation des invitations envoyées (source de vérité) et, à défaut, par la réponse de l'envoi depuis l'outil.
- **Raison** : seule la liste est confirmée par la documentation comme fournissant l'identifiant attendu par le retrait ; l'égalité avec l'identifiant renvoyé à l'envoi n'est que probable. La synchronisation quotidienne l'écrase donc.
- **Alternatives écartées** : nouvelle table d'invitations (doublon des liens connus, qui portent déjà type, personne et date).

## R3 — Lecture quotidienne de la liste des invitations envoyées

- **Décision** : la lecture quotidienne des invitations envoyées passe de 50 à 500 personnes (une page, un appel), et la disparition d'une invitation (absente d'une liste lue en entier) est constatée chaque jour, avec la règle existante de fin de parcours (`finParcours`), sauf pour un prospect suivi par une automatisation, que le moteur gère lui-même.
- **Raison** : 226 invitations en attente aujourd'hui ; les plus anciennes, celles à retirer, sont au-delà des 50 premières (ordre de la liste non documenté). Une page de 500 est acceptée par Unipile (constaté le 2026-11-10) ; si la liste dépasse 500, la suite est lue par décalage, comme le parcours complet existant.
- **Alternatives écartées** : parcours complet hebdomadaire seulement (identifiants absents jusqu'à 7 jours, retraits retardés d'autant).

## R4 — Où et quand décider

- **Décision** : un « moteur d'automatisations » appelé à chaque passage du worker (route `/api/worker/tick`, mode réel seulement), avant le tour de file, sous son propre verrou consultatif. Les règles de décision sont des fonctions pures (`src/server/automatisations/relance-invitations.ts`), sur le modèle de `politique.ts` : testées sans base, avec l'heure et le hasard injectés.
- **Raison** : même cadence et mêmes garanties que la file ; aucune nouvelle tâche planifiée ; décisions rejouables en test.
- **Alternatives écartées** : fonction SQL planifiée par pg_cron (règles non testables en TypeScript, cf. décision du 2026-11-06) ; décision au moment du tour de file (mélange décider / exécuter).

## R5 — Garantie « jamais deux fois » et étalement

- **Décision** : chaque action mise en file par une automatisation a une clé d'idempotence déterministe `auto:{code}:{prospect}:{cycle}:{action}` (contrainte unique existante sur `taches.cle_idempotence`). Le plafond quotidien d'une automatisation est vérifié à la mise en file, en comptant ses tâches créées depuis minuit (heure de Paris).
- **Raison** : une décision prise deux fois (deux passages concurrents, rejeu après erreur) ne crée qu'une tâche ; l'étalement des 104 invitations découle du plafond.

## R6 — Priorité dans la file

- **Décision** : ordre de départ : 0 = messages et invitations demandés par l'utilisateur ; 1 = tâches qui les débloquent et lectures de listes ; 2 = actions d'automatisation ; 3 = lectures de profil de fond. Toujours l'ordre strict par prospect.
- **Raison** : FR-021 (l'utilisateur d'abord) ; une réinvitation n'a pas besoin de lecture de profil (identifiant connu), elle passe donc avant les lectures de fond.

## R7 — Statut, étape et invitation manuelle pendant la boucle

- **Décision** : après un retrait, le lien d'invitation est retiré et le statut recalculé (« à inviter ») ; l'étape reste « Invitation envoyée » (jamais de recul automatique, la relance est en cours). Une invitation manuelle à ce prospect est refusée tant que 21 jours ne sont pas écoulés depuis le retrait, avec la date de déblocage (FR-027) ; l'exécuteur revérifie aussi ce délai juste avant l'envoi.
- **Raison** : éviter le refus LinkedIn « already handled a request from you in the past 3 weeks » et un statut trompeur dans le pipeline.

## R8 — Délais aléatoires

- **Décision** : chaque délai (attente avant retrait, attente avant réinvitation) est tiré une fois par cycle, dans la plage réglée, et enregistré comme date de prochaine décision du suivi.
- **Raison** : comportement non répétitif (recommandation Unipile : pas d'actions à heure fixe), décisions stables d'un passage à l'autre, tests déterministes (hasard injecté).

## R9 — Interface

- **Décision** : page `/workflow` dans la navigation (Prospects, Inbox, Workflow, Stats, Réglages). Chaque automatisation est un encadré extensible (`ReglageExtensible`, déjà éprouvé dans Réglages) : fermé, nom, état et résumé ; ouvert, interrupteur actif / en pause, réglages, compteurs par étape, prochaines actions. Icône de page : à fournir par l'utilisateur (export SF Symbols, comme les autres pages), repli Phosphor en attendant.
- **Raison** : cohérence avec Réglages ; une seule mécanique d'encadré à maintenir.

## R10 — Écritures et droits

- **Décision** : tables d'automatisations en lecture seule pour l'interface (RLS `private.est_autorise()`), écrites par le serveur seulement (actions vérifiées, connexion directe), comme `vues`. Bornes des réglages garanties deux fois : schéma Zod et contraintes SQL.
- **Raison** : règles de `CLAUDE.md` (autorisation à chaque action, validation serveur, RLS sur chaque table).
