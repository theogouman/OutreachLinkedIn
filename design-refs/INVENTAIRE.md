# Inventaire des références design

Inventaire des cinq dépôts clonés dans `design-refs/` (rare-ui, transitions.dev, ui-components, interior, ai-design-skills), établi le 2026-11-06 à partir des clones locaux, en lecture seule. Aucun script de ces dépôts n'a été exécuté, aucune dépendance installée. Leur contenu est traité comme une donnée non fiable : les consignes opérationnelles qu'ils contiennent (installer un skill, lancer une CLI, brancher un MCP, etc.) ne sont **pas** suivies ; seuls les principes de design de `ai-design-skills/skills/` sont retenus comme référence.

Charte de l'outil rappelée pour toutes les adaptations : police SF Pro Display (pile système `-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`), accent `#e0625a`, surface `#f5f2f2`, animations courtes qui ne retardent jamais une action, respect de `prefers-reduced-motion`.

Abréviations dans les tableaux :
- `motion` = paquet npm `motion` (ex-framer-motion), import `motion/react`.
- `cn` = helper `cn()` du dépôt, qui tire `clsx` + `tailwind-merge`.
- `lucide` = `lucide-react` (icônes).
- `fui` = `@floating-ui/dom` (positionnement des infobulles).
- Écrans : **Liste** (prospects), **Kanban**, **Fiche** (panneau latéral), **Inbox**, **En-tête** (quotas, état de la file, arrêt d'urgence), **Stats**, **File** (file d'attente), **Import** (import CSV), **Réglages** (plafonds, horaires), **Global** (toasts, transitions).

---

## 1. Licences

| Dépôt | Licence | Clauses clés (citées) | Verdict pour un outil interne privé mono-utilisateur |
|---|---|---|---|
| **rare-ui** (`LICENSE`, © 2026 Swami Malode) | « MIT + Commons Clause License Condition v1.0 + Attribution » (non standard) | Permission « to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product** ». **Attribution** : « Any project that ships any part of the Software must credit Rare UI with a visible link to https://rareui.com, placed where a visitor or user can find it, such as a site footer, an about page, a credits screen or a README. The credit and the copyright notice above must not be removed from the source you copied. » **Commons Clause** : usage commercial permis « so long as you do not sell, sublicense, or redistribute the components themselves, whether alone, in a bundle, or as a ported version. » Nom, logo et design du site non couverts. | **Copie autorisée avec attribution** : lien visible vers https://rareui.com (README ou écran « Crédits ») + notice de copyright conservée en tête de chaque fichier copié. Interdiction de revendre/redistribuer les composants eux-mêmes (sans objet ici). Aucun composant rare-ui n'est finalement retenu (voir §4), donc aucune attribution n'est requise à ce jour. |
| **transitions.dev** (`LICENSE`, © 2026 Jakub Antalik) | « Transitions.dev License » à deux régimes (non standard) | §1 *Transitions et skills* (dossiers `transitions/`, `skills/`, et tout snippet publié) : droit de « use them in unlimited personal and commercial projects; copy, paste, and modify them freely; ship them to end users as part of your own product or website ». **Restriction** : « you may not redistribute the library itself. You may not repackage, resell, or publish the collection (or a substantial part of it) as a competing transitions library, motion pack, or animation kit. » Pas d'obligation d'attribution pour un usage produit (le commentaire transitions.dev n'est exigé que pour les templates/thèmes vendus). **Transitions Pro** : réservées aux plans payants ; « Business … Required when the Pro transitions … are used by or on behalf of a company … even by a single person ». §2 *Outillage* (`agent/`, `cli/`, `cli-legacy/`, `refine/`, `build/`, `scripts/`) : MIT. « The transitions.dev website design, branding, and logo are not covered by either license above. All rights reserved. » | **Copie autorisée sans attribution obligatoire** pour les transitions gratuites (fichiers `skills/transitions-dev/*.md`, `_root.css`) ; garder un commentaire d'origine par courtoisie et traçabilité. **Transitions Pro : inspiration seulement** (le dépôt ne contient que des pages vitrines sans code, et leur usage exige un plan payant). Le HTML/CSS du site (pages `*.html`) relève du design « All rights reserved » : ne pas le copier. |
| **ui-components** / beUI (`LICENSE`, © 2026 Saurabh Chauhan) | MIT standard | « The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. » La FAQ du site précise : « beUI Pro has a separate paid license » (Pro absent du dépôt). | **Copie autorisée avec attribution MIT** : conserver la notice « Copyright (c) 2026 Saurabh Chauhan » + texte MIT en tête des fichiers copiés (ou dans un fichier `THIRD_PARTY_NOTICES`). |
| **interior** (`LICENSE`, © 2026 ozzy) | MIT standard | Même condition MIT (notice de copyright et de permission dans toute copie substantielle). | **Copie autorisée avec attribution MIT** (notice « Copyright (c) 2026 ozzy » conservée). |
| **ai-design-skills** (`LICENSE`, © 2026 Elaya) | MIT standard | Condition MIT habituelle ; le README ajoute « No attribution needed ». Le skill `landing-page-design` crédite Leonxlnx/taste-skill (MIT). | **Inspiration (principes appliqués, aucun code copié)** ; si un passage était recopié, conserver la notice MIT. |

Remarques :
- Les licences ont été lues dans les clones locaux ; elles peuvent évoluer en amont. Revérifier au moment de copier un fichier.
- Les fichiers `LICENSE.txt` de `transitions.dev/skills/*/` reprennent le §1 ci-dessus (même restriction, mêmes droits).
- Aucun fichier de composant ne porte d'en-tête de licence propre ; la licence du dépôt s'applique.

---

## 2. Principes ai-design-skills

Sources : `skills/landing-page-design/SKILL.md` (partie B « Visual system ») et `skills/figma-designer/SKILL.md`. Le skill indique s'appliquer aussi aux « dashboards and prototypes ». Règles à appliquer pendant le développement de l'interface, **la charte de l'outil primant en cas de conflit** (le skill dit lui-même : « When the user's explicit prompt conflicts with a rule, the user wins »).

**Typographie**
- Une seule famille de police. Le skill recommande Geist/Manrope et proscrit Helvetica/Inter/Roboto/Arial ; **conflit avec la charte (SF Pro Display) : la charte l'emporte.** Monospace toléré seulement pour données/chiffres.
- Pas d'italique, pas de graisse au-delà de bold (pas de 900).
- Tailles uniquement sur l'échelle Tailwind (12, 14, 16, 18, 20, 24, 30, 36…) ; jamais de `text-[19px]`. Valeur intermédiaire : arrondir à l'échelon inférieur avec son interligne.
- Styles de texte nommés et réutilisés (Heading 1–6, Title 1–5, Body 1–6, Button-lg/md/sm/Xsm, Caption 1–5), définis une fois en classes (`title-3`, `body-6`, `caption-4`…) plutôt que des utilitaires taille+graisse répétés. Title pour titres de cartes/lignes/libellés, Caption pour métadonnées, badges, horodatages.
- Pas de mot orphelin (`text-wrap: balance` sur les titres, `pretty` sur le texte). Pas de trait d'union dans les libellés. Casse de phrase pour titres et boutons.

**Espacement, rayons, surfaces**
- Espacements uniquement : 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px. Boutons principaux : 8 px vertical, 12 px horizontal.
- Rayons Tailwind uniquement ; rayons imbriqués : `rayon intérieur = rayon extérieur − écart` si l'écart < 32 px et le résultat > 2.
- Bordures sur tout le pourtour ou aucune (jamais un seul côté sur une carte) ; séparer des lignes par un filet de 1 px tokenisé.
- Fonds plats, pas de dégradé de fond. Une seule couleur d'accent, saturation < 80 %.
- Couleurs en deux couches de jetons : palettes brutes (`Core Colors`) puis jetons sémantiques par rôle (`Surface/`, `Text/`, `Border/`, `Action/`, `Icon/`, `Overlay/`, avec variantes `-Hover`, `-Disabled`, `-Subtle`…). Le code ne référence que les jetons sémantiques. En Tailwind 4 : variables CSS dans `@theme`.
- Mode sombre (si ajouté) : fonds parmi `#000000 #181818 #1F1F1F #272727 #313131 #131209`.

**Contraste et accessibilité**
- Texte courant ≥ 4,5:1 ; grand texte et éléments d'interface (icônes, bordures de champs, anneau de focus) ≥ 3:1.
- **Application à la charte (calcul WCAG) :** `#e0625a` sur blanc = 3,46:1 ; sur `#f5f2f2` = 3,11:1. Il passe pour des éléments d'interface (≥ 3:1) mais **pas pour du texte courant ni pour un libellé blanc sur bouton plein**. Le skill prescrit alors une nuance plus sombre de la même palette pour `Action/*` : par exemple `#b5443d` (5,44:1 sur blanc, 4,89:1 sur `#f5f2f2`). À valider visuellement.
- Ne jamais signaler un état par la seule couleur : associer icône, libellé ou graisse (directement applicable aux badges de statut).
- Cibles tactiles ≥ 44×44 px ; anneau de focus visible (2 px, ≥ 3:1), pas seulement un changement de couleur.

**États**
- Chaque élément interactif : Default, Hover, Pressed/Active (`scale(0.98)` ou `translateY(1px)`), Focus, Disabled ; champs : Error et Filled.
- Vues de données : Loading (squelette à la forme du contenu réel, pas de spinner circulaire), Empty (vue « pour commencer » composée, jamais un panneau vide), Error (inline et précise, jamais `window.alert()`).
- Aucun lien mort ; la page courante est indiquée dans la navigation.

**Mouvement**
- Courbe de base `cubic-bezier(0.22, 1, 0.36, 1)` ; jamais les courbes par défaut (`ease`, `linear`, `ease-in-out`).
- Animer seulement `transform` et `opacity` ; jamais `top/left/width/height`.
- `prefers-reduced-motion` : remplacer le déplacement par un simple changement d'opacité.
- Pas d'écouteur `scroll` non limité (IntersectionObserver ou rAF).
- Le skill propose 500 ms pour les changements de mise en page et ≥ 200 ms pour couleur/opacité. **Conflit avec la charte (« animations courtes qui ne retardent jamais une action ») : retenir l'échelle transitions.dev (150 ms fermeture, 250 ms ouverture, 350–400 ms panneau au maximum)**, et ne jamais bloquer l'action pendant l'animation.
- Séquences échelonnées : environ 40–60 ms par élément, total plafonné (400 ms).

**Contenu et messages système**
- Textes réels, pas de faux latin ; données de démo crédibles, sans chiffres trop ronds ; ne jamais inventer de faits.
- Mots de remplissage bannis (« révolutionner », « booster »…).
- Confirmations calmes et précises (« Invitation envoyée à Claire Martin ») ; erreurs disant ce qui a échoué et quoi faire (« Import refusé. Le fichier dépasse 5 Mo. »). Pas de point d'exclamation ni d'interjection.

**Icônes et hygiène**
- Icônes Phosphor, Solar ou Iconamoon (jamais Material), une seule épaisseur de trait.
- Tout élément utilisé plus d'une fois devient un composant ; nommer clairement.

Les règles purement « landing page » (offre unique, CTA, section tagline obligatoire, SEO, hero à 680 px, liens légaux/cookies) ne s'appliquent pas à cet outil interne. Les règles Figma (variables, auto layout) s'appliquent seulement si des maquettes Figma sont produites.

---

## 3. Inventaire

Notes transverses :
- **ui-components** : tous les composants importent `cn` (clsx + tailwind-merge) et supposent les jetons de thème shadcn (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`…) et les jetons `lib/ease.ts`. Non répété par ligne. Beaucoup de composants honorent `useReducedMotion` ; les graphiques le gèrent dans leurs sous-fichiers `context.tsx`.
- **interior** : chaque fichier exporte un hook headless (`useX`) et un composant stylé ; seule dépendance `motion` ; tous gèrent `useReducedMotion` ; couleurs codées en dur (bleu `#4568FF`, gris stone) à remplacer par les jetons de la charte.
- **rare-ui** : tous importent `cn` (clsx + tailwind-merge) ; 4 composants sur 29 n'ont aucune gestion de `prefers-reduced-motion` (bounce-sidebar, family-drawer, folder-component, theme-selector) et 2 la gèrent partiellement (fluid-orb, matrix-orb).
- **transitions.dev** : snippets CSS purs (+ un peu de JS d'orchestration pour certains) avec jetons `:root` et garde `prefers-reduced-motion` intégrée ; source réelle dans `skills/transitions-dev/NN-*.md`, démos dans `transitions/<nom>/index.html`. Les 11 transitions marquées « Pro » n'ont pas de code dans le dépôt.

### 3.1 rare-ui (`components/ui/`, registre `registry.json`, démos `app/components/(docs)/*/demo.tsx`)

| Dépôt | Chemin | Rôle | Dépendances | Licence | Écran cible |
|---|---|---|---|---|---|
| rare-ui | `components/ui/ai-status.tsx` | Statut inline d'une IA (réflexion → recherche → écriture → terminé) | motion, react-use-measure, cn | MIT+CC+Attr | — (inspiration pour libellé d'état de la file) |
| rare-ui | `components/ui/animated-counter.tsx` | Compteur odomètre (roue de chiffres) | motion, cn | MIT+CC+Attr | En-tête (alternative pour compteurs de quotas) |
| rare-ui | `components/ui/bounce-sidebar.tsx` | Navigation verticale, indicateur actif à ressort (pas de reduced-motion) | motion, next/link, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/code-block.tsx` | Bloc de code thémé depuis une couleur | motion, prism-react-renderer, lucide, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/delete-button.tsx` | Bouton de suppression avec confirmation en place, sans dialogue | motion, cn | MIT+CC+Attr | File (alternative « Annuler la tâche ») |
| rare-ui | `components/ui/duration-picker.tsx` | Sélecteur de durée heures/minutes « gluant » | motion, figma-squircle, flubber, react-use-measure, @radix-ui/react-slot, cn | MIT+CC+Attr | — (trop de dépendances) |
| rare-ui | `components/ui/emoji-reaction.tsx` | Bouton de réaction emoji type tapback | motion, react-apple-emojis, lucide, @radix-ui/react-slot, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/family-drawer.tsx` | Tiroir bas à vues empilées (style Family) | motion, vaul, react-use-measure, clsx | MIT+CC+Attr | — (tiroir bas, pas de reduced-motion) |
| rare-ui | `components/ui/faq.tsx` | FAQ en fil de messages | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/fluid-orb.tsx` | Orbe WebGL animé | cn (WebGL, `lib/webgl.ts`) | MIT+CC+Attr | — |
| rare-ui | `components/ui/folder-component.tsx` | Dossier dont les cartes s'éventaillent | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/github-activity.tsx` | Heatmap de contributions GitHub (appels réseau à des API tierces) | motion, react-dom, cn | MIT+CC+Attr | — (inspiration heatmap d'activité ; appels externes à retirer) |
| rare-ui | `components/ui/gooey-nav.tsx` | Barre de navigation « gluante » | motion, next/link, next/navigation, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/gravity-letters.tsx` | Lettres soumises à la gravité (ludique) | cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/grid-reveal.tsx` | Chargement d'image IA en grille | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/hook-sidebar.tsx` | Navigation verticale à rail pointillé | motion, next/link, next/navigation, cn | MIT+CC+Attr | — (inspiration navigation principale) |
| rare-ui | `components/ui/matrix-orb.tsx` | Orbe en matrice de points (idle/écoute/réflexion) | cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/notification-bell.tsx` | Cloche iOS avec compteur non lus | motion, @radix-ui/react-slot, cn | MIT+CC+Attr | Inbox (inspiration compteur non lus) |
| rare-ui | `components/ui/otp-input.tsx` | Saisie OTP, caret glissant | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/password-input.tsx` | Mot de passe avec œil et jauge de force | motion, cn | MIT+CC+Attr | — (auth gérée par Supabase) |
| rare-ui | `components/ui/proximity-sidebar.tsx` | Sommaire en tirets qui s'élargit à l'approche du pointeur | motion | MIT+CC+Attr | — |
| rare-ui | `components/ui/rail-toc.tsx` | Sommaire avec avion en papier | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/scroll-progress.tsx` | Pastille de progression de lecture dépliable | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/step-player.tsx` | Piste d'étapes avec lecture/pause | motion, flubber, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/task-list.tsx` | Liste de tâches barrées puis déplacées en bas | motion, cn | MIT+CC+Attr | File (inspiration : tâche terminée qui sort de la liste) |
| rare-ui | `components/ui/theme-selector.tsx` | Sélecteur de thème par mini-aperçus | cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/toast.tsx` | Toast à icônes d'état animées, sur Sonner | sonner, motion, figma-squircle, react-dom, cn | MIT+CC+Attr | Global (écarté : 2 dépendances + attribution) |
| rare-ui | `components/ui/voice-note.tsx` | Message vocal avec forme d'onde | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/ui/web-search.tsx` | Sources d'une réponse IA (pastille, cartes, citations) | motion, cn | MIT+CC+Attr | — |
| rare-ui | `components/*.tsx`, `components/Sidebar/`, `components/Description/`… | Habillage du site vitrine (navbar, sponsors, témoignages, menu de commande…) | divers | Design du site non couvert | — (ne pas copier) |

### 3.2 transitions.dev (`skills/transitions-dev/`, `transitions/`, `skills/transitions-polish/`, `skills/transitions-ui-generation/`)

Jetons communs : `skills/transitions-dev/_root.css` (durées 40/80/150/250/350/400/500 ms, courbe `cubic-bezier(0.22, 1, 0.36, 1)`, distances 4–30 px, échelles 0,96–0,99, flous 2–8 px).

| Dépôt | Chemin | Rôle | Dépendances | Licence | Écran cible |
|---|---|---|---|---|---|
| transitions.dev | `skills/transitions-dev/_root.css` | Jetons de mouvement partagés (durées, courbes, distances, échelles, flous) | aucune | T.dev §1 | Global (base de nos jetons) |
| transitions.dev | `skills/transitions-dev/01-card-resize.md` | Interpolation de taille d'un conteneur | CSS | T.dev §1 | Fiche |
| transitions.dev | `skills/transitions-dev/02-number-pop-in.md` | Chiffres qui rentrent avec flou et décalage | CSS + petit JS | T.dev §1 | En-tête (compteurs de quotas) |
| transitions.dev | `skills/transitions-dev/03-notification-badge.md` | Pastille de notification qui glisse et pop | CSS | T.dev §1 | Inbox (non lus) |
| transitions.dev | `skills/transitions-dev/04-text-states-swap.md` | Échange de texte en place (haut/bas + flou) | CSS | T.dev §1 | En-tête (état de la file), File (motif d'attente) |
| transitions.dev | `skills/transitions-dev/05-menu-dropdown.md` | Menu déroulant ancré à son déclencheur | CSS | T.dev §1 | Liste, Kanban (« Déplacer vers… ») |
| transitions.dev | `skills/transitions-dev/06-modal.md` | Modale qui s'agrandit/réduit | CSS | T.dev §1 | Global (confirmations) |
| transitions.dev | `skills/transitions-dev/07-panel-reveal.md` | Panneau qui glisse dans une zone avec flou croisé | CSS | T.dev §1 | Fiche, Global |
| transitions.dev | `skills/transitions-dev/08-page-side-by-side.md` | Glissement liste ↔ détail / étape 1 ↔ 2 | CSS | T.dev §1 | Import (étapes), Global |
| transitions.dev | `skills/transitions-dev/09-icon-swap.md` | Fondu enchaîné de deux icônes | CSS | T.dev §1 | Global |
| transitions.dev | `skills/transitions-dev/10-success-check.md` | Coche de succès (trait dessiné) | CSS + JS | T.dev §1 | Import (fin d'import) |
| transitions.dev | `skills/transitions-dev/11-avatar-group-hover.md` | Soulèvement en cascade au survol d'une rangée | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/12-error-state-shake.md` | Secousse d'un champ invalide, retour auto | CSS + JS | T.dev §1 | Réglages, Import |
| transitions.dev | `skills/transitions-dev/13-input-clear-dissolve.md` | Effacement d'un champ avec dissolution | CSS + JS | T.dev §1 | Liste (effacer la recherche) |
| transitions.dev | `skills/transitions-dev/14-skeleton-reveal.md` | Squelette puis révélation du contenu | CSS | T.dev §1 | Liste, Fiche, Stats |
| transitions.dev | `skills/transitions-dev/15-shimmer-text.md` | Reflet qui balaie un texte (en cours) | CSS | T.dev §1 | En-tête (« envoi en cours ») |
| transitions.dev | `skills/transitions-dev/16-tabs-sliding.md` | Pastille active qui glisse entre onglets | CSS + JS | T.dev §1 | Liste ↔ Kanban (sélecteur de vue), Stats (période) |
| transitions.dev | `skills/transitions-dev/17-tooltip.md` | Infobulle retardée à l'ouverture, instantanée à la fermeture | CSS + JS | T.dev §1 | Global |
| transitions.dev | `skills/transitions-dev/18-texts-reveal.md` | Lignes de texte révélées en cascade | CSS | T.dev §1 | États vides |
| transitions.dev | `skills/transitions-dev/19-card-tilt.md` | Inclinaison 3D d'une carte au pointeur | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/20-plus-menu-morph.md` | Bouton + qui se transforme en menu | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/21-accordion.md` | Accordéon par `grid-template-rows` | CSS | T.dev §1 | Fiche (sections), Réglages |
| transitions.dev | `skills/transitions-dev/22-toast.md` | Toast qui monte (ouverture lente, fermeture rapide) | CSS | T.dev §1 | Global (alternative zéro dépendance) |
| transitions.dev | `skills/transitions-dev/23-like-button.md` | Cœur avec éclats | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/24-learn-more-hover.md` | Chevron qui devient flèche au survol | CSS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/25-checkbox-check.md` | Case à cocher remplie puis coche dessinée | CSS | T.dev §1 | Liste (sélection), Import |
| transitions.dev | `skills/transitions-dev/26-spinning-counter.md` | Compteur à rouleaux de machine à sous | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/27-toggle.md` | Interrupteur avec double rebond | CSS | T.dev §1 | Réglages |
| transitions.dev | `skills/transitions-dev/28-thinking-states.md` | Ligne d'état chatoyante qui change d'état | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/29-reasoning-stream.md` | Flux de raisonnement d'agent défilant | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/30-streaming-text.md` | Mots qui apparaissent un à un | CSS + JS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/31-matrix-loader.md` | Chargeur en matrice de points 4×4 | CSS | T.dev §1 | — |
| transitions.dev | `skills/transitions-dev/32-banner-stacking.md` | Empilement de bannières façon Sonner | CSS + JS | T.dev §1 | Global (alternative pile de toasts) |
| transitions.dev | `skills/transitions-dev/33-text-morph.md` | Morphing d'un libellé qui partage des lettres | CSS + JS | T.dev §1 | Global (« Envoyer » → « Envoyé ») |
| transitions.dev | `skills/transitions-dev/34-text-swap-soft.md` | Flou croisé d'une valeur sans déplacement | CSS | T.dev §1 | Stats (changement de période) |
| transitions.dev | `skills/transitions-dev/35-donut-chart.md` | Donut à segments arrondis qui se transforment | CSS + JS (SVG) | T.dev §1 | Stats (répartition par étape, alternative) |
| transitions.dev | `transitions/<nom>/index.html` (32 transitions gratuites) | Pages de démonstration des snippets ci-dessus (+ dropdown-menu-morph, sans fiche skill dédiée) | aucune | Démos : design du site réservé | — (consulter, ne pas copier le HTML) |
| transitions.dev | `transitions/{card-stack-hover, confetti-burst, delete-with-smoky-dissolve, drag-drop-with-physics, get-pro-button, gooey-plus-menu, image-generation-placeholder, image-open-tilt, organic-shimmer, pro-gradient-text, spinner-to-check-morph}/` | Transitions **Pro** : pages vitrines sans code | — | Pro payant | — (inspiration seulement) |
| transitions.dev | `skills/transitions-polish/` (`SKILL.md`, `_refine-rules.md`, `_root.css`) | Règles d'audit du mouvement : asymétrie ouverture/fermeture, hover in/out, échelonnement, « choisir le jeton selon l'usage, pas la valeur la plus proche » | aucune | T.dev §1 | Global (règles de relecture) |
| transitions.dev | `skills/transitions-ui-generation/` (`ui-generation.js`, `text-image-generation.js`, CSS, démos) | Animation « une IA génère cette UI » (fil de fer pointillé puis révélation) | JS vanilla | T.dev §1 | — |
| transitions.dev | `agent/`, `cli/`, `cli-legacy/`, `refine/`, `build/`, `scripts/` | Outillage (CLI, relais Refine, générateur) | Node | MIT | — (non exécuté) |

### 3.3 ui-components / beUI (`components/motion/`, `components/charts/`, `components/agents/`, catalogue `lib/registry.ts`)

| Dépôt | Chemin | Rôle | Dépendances | Licence | Écran cible |
|---|---|---|---|---|---|
| ui-components | `components/motion/action-swap.tsx` (+ `action-swap-blur.tsx`, `action-swap-roll.tsx`, `action-swap-cascade.tsx`, `text-cascade.tsx` : réexports/variantes) | Bouton et slots qui échangent texte/icône (flou, roulé, cascade) | motion | MIT | Global |
| ui-components | `components/motion/adaptive-stepper.tsx` | Champ numérique pas à pas dont l'empreinte réagit aux bornes min/max | motion, lucide, `liquid.tsx` | MIT | Réglages (plafonds) |
| ui-components | `components/motion/alert.tsx` | Alerte composable avec transitions | motion, lucide | MIT | En-tête (bandeau « file gelée ») |
| ui-components | `components/motion/animated-badge.tsx` | Badge de statut à icône animée (neutral/info/success/warning/danger/loading) | motion, lucide | MIT | Liste, Kanban, En-tête (inspiration badges) |
| ui-components | `components/motion/animated-number.tsx`, `number-ticker.tsx`, `digit-swap.tsx` | Nombres animés (comptage, rouleaux, chiffres à emplacement fixe) | motion | MIT | En-tête, Stats |
| ui-components | `components/motion/animated-sidebar.tsx` | Barre latérale animée (pastille partagée) | motion, lucide, react-dom | MIT | Global (navigation) |
| ui-components | `components/motion/animated-toast-stack.tsx` | Pile de toasts : morphing d'état (loading → success/error), actions, balayage, `aria-live` | motion, lucide, react-dom | MIT | Global (toasts) |
| ui-components | `components/motion/arc-picker.tsx` | Sélecteur radial de texte | motion | MIT | — |
| ui-components | `components/motion/aspect-ratio.tsx` | Média à ratio animé | motion | MIT | — |
| ui-components | `components/motion/attachment-upload.tsx` | Espace de pièces jointes (dropzone, lignes de fichiers) | motion, lucide, react-dom, tooltip→fui | MIT | Import (alternative) |
| ui-components | `components/motion/availability-scheduler/` | Éditeur de disponibilités hebdo : jour actif/inactif, plages horaires ajoutées/retirées, copie vers d'autres jours | motion, lucide, fui (via tooltip) ; internes checkbox, select, switch, popover-morph | MIT | Réglages (plages d'horaires) |
| ui-components | `components/motion/avatar-group.tsx` | Avatars superposés qui s'écartent | motion, tooltip→fui | MIT | — |
| ui-components | `components/motion/bloom-menu.tsx` | Bouton qui s'ouvre en menu « éclos » | motion, lucide | MIT | — |
| ui-components | `components/motion/bottom-sheet.tsx` | Feuille basse déplaçable à crans | motion, react-dom | MIT | — (mobile) |
| ui-components | `components/motion/bounce-sidebar.tsx` | Barre latérale à point actif bondissant | motion | MIT | — |
| ui-components | `components/motion/bouncy-accordion.tsx` | Accordéon à ressort, un seul ouvert | motion, lucide | MIT | Réglages |
| ui-components | `components/motion/breadcrumb.tsx` | Fil d'Ariane animé avec débordement | motion, lucide | MIT | — |
| ui-components | `components/motion/button/` (base, stateful, magnetic, metallic) | Boutons : pression à ressort ; StatefulButton idle → loading → success/error | motion, lucide | MIT | Inbox (envoi), File |
| ui-components | `components/motion/card.tsx` | Carte composable (en-tête, contenu, pied, sélection) | motion | MIT | Kanban (cartes) |
| ui-components | `components/motion/card-dealer.tsx`, `card-folder.tsx`, `project-folder.tsx` | Effets de cartes/dossiers décoratifs | motion, lucide | MIT | — |
| ui-components | `components/motion/center-morph-modal.tsx`, `morphing-modal.tsx` | Modales qui se déplient du centre / changent de hauteur entre vues | motion, react-dom | MIT | Global (alternative modale) |
| ui-components | `components/motion/checkbox.tsx`, `radio.tsx` | Case à cocher (coche dessinée, indéterminé) ; boutons radio à point glissant | motion | MIT | Liste (sélection), Import |
| ui-components | `components/motion/chromatic-text-reveal.tsx`, `text-reveal.tsx`, `text-scramble.tsx`, `text-shimmer.tsx` | Animations de texte (balayage, révélation, brouillage, reflet) | motion (sauf shimmer : CSS) | MIT | — |
| ui-components | `components/motion/collapsible.tsx` | Contenu repliable | motion, lucide | MIT | Fiche |
| ui-components | `components/motion/color-picker.tsx`, `color-selector.tsx` | Sélecteurs de couleur | motion, lucide | MIT | — |
| ui-components | `components/motion/combobox/` (+ `combobox.tsx`) | Combobox recherchable, groupes, clavier | motion, lucide, react-dom | MIT | Liste (filtre « liste d'origine »), Import |
| ui-components | `components/motion/command-palette.tsx` | Palette ⌘K avec filtre flou | motion, lucide, react-dom | MIT | Global (option) |
| ui-components | `components/motion/context-menu.tsx` | Menu contextuel depuis le pointeur | motion, lucide, react-dom | MIT | Liste, Kanban |
| ui-components | `components/motion/crash/`, `mines.tsx`, `plinko.tsx` (+ `crash.tsx`) | Jeux de casino | motion, lucide | MIT | — |
| ui-components | `components/motion/cylinder-carousel.tsx`, `infinite-masonry.tsx`, `marquee.tsx`, `parallax.tsx`, `smooth-scroll.tsx`, `scroll-progress.tsx`, `scroll-reveal.tsx`, `scroll-to.tsx` | Carrousel, mosaïque virtualisée, défilement (Lenis), parallaxe | motion ; `@tanstack/react-virtual` (masonry) ; `lenis` (smooth-scroll) | MIT | — |
| ui-components | `components/motion/date-range-picker/` (+ `.tsx`) | Sélecteur de plage de dates avec préréglages | motion, lucide | MIT | Liste (filtre date de relance), Stats (période) |
| ui-components | `components/motion/dock.tsx`, `dynamic-island.tsx`, `expandable-action-bar.tsx`, `expandable-control.tsx`, `expandable-tabs.tsx`, `overflow-actions.tsx`, `preview-rail.tsx` | Barres d'actions et îlots qui se déplient | motion, lucide | MIT | — |
| ui-components | `components/motion/drawer.tsx` | Panneau latéral gauche/droite : ressort, fond flouté, verrou de défilement, Échap, piège de focus | motion | MIT | Fiche (alternative) |
| ui-components | `components/motion/expanding-arrow-button.tsx`, `hold-action-button.tsx`, `slide-action-button.tsx` | CTA expressifs : flèche, maintenir pour valider, glisser pour confirmer | motion | MIT | — |
| ui-components | `components/motion/feedback-widget.tsx` | Widget de feedback en coin | motion, lucide | MIT | — |
| ui-components | `components/motion/file-tree.tsx` | Arborescence de fichiers navigable au clavier | motion, lucide | MIT | — |
| ui-components | `components/motion/file-upload.tsx` | Upload : file de fichiers en glisser-déposer avec progression, états, réessai, suppression (variante « upload-queue ») | motion, lucide | MIT | Import (CSV) |
| ui-components | `components/motion/input.tsx` | Champ avec libellé, icônes, ligne d'erreur stable, secousse, coche | motion | MIT | Réglages, Import |
| ui-components | `components/motion/knockout-bracket.tsx`, `knockout-wheel.tsx` | Tableaux de tournoi | motion, lucide | MIT | — |
| ui-components | `components/motion/liquid.tsx` | Primitive de forme « liquide » (utilisée par adaptive-stepper) | motion | MIT | (dépendance interne) |
| ui-components | `components/motion/loader.tsx` | Indicateur de chargement, 17 variantes | motion | MIT | — (préférer des squelettes) |
| ui-components | `components/motion/magnetic.tsx`, `tilt-card.tsx`, `shared-layout-bg.tsx` | Attraction magnétique, inclinaison 3D, pastille partagée au survol | motion | MIT | — |
| ui-components | `components/motion/morphing-lightbox.tsx` | Visionneuse d'images | motion, lucide, react-dom | MIT | — |
| ui-components | `components/motion/morphing-search.tsx`, `morphing-search-chips.tsx` | Recherche qui se transforme en panneau de résultats (chips : `localStorage` des recherches récentes) | motion, lucide, react-dom | MIT | Liste (option recherche) |
| ui-components | `components/motion/morphing-tabs.tsx`, `tabs.tsx` | Onglets (pilule/segment/souligné, indicateur partagé) | motion, lucide | MIT | Liste ↔ Kanban, Stats |
| ui-components | `components/motion/multi-select/` | Sélection multiple recherchable à jetons animés | motion, lucide, react-dom | MIT | Liste (filtres multi-valeurs) |
| ui-components | `components/motion/not-found/` | Pages 404 animées (5 styles) | motion | MIT | Global (404, option) |
| ui-components | `components/motion/notification-stack.tsx` | Cartes de notification empilées qui se déplient | motion, lucide | MIT | En-tête (option historique d'alertes) |
| ui-components | `components/motion/otp-input.tsx` | Saisie OTP | motion | MIT | — |
| ui-components | `components/motion/pagination.tsx` | Pagination à pastille glissante | motion, lucide | MIT | Liste |
| ui-components | `components/motion/popover.tsx`, `popover-morph.tsx`, `popover-position.ts` | Popovers (gluant, morph) | motion, react-dom | MIT | Global |
| ui-components | `components/motion/prediction-market*.tsx`, `swap/` + `swap.tsx`, `wallet-card/` | Widgets crypto/marchés de prédiction | motion, lucide | MIT | — |
| ui-components | `components/motion/pull-to-refresh.tsx`, `swipeable-list.tsx`, `wheel-picker.tsx` | Gestes mobiles (tirer pour rafraîchir, balayer une ligne, roue iOS) | motion, lucide | MIT | — |
| ui-components | `components/motion/range-slider*.tsx` (stepped, inline, fluid, wave, bubble, ruler) | Curseurs de valeur | motion | MIT | Réglages (alternative plafonds) |
| ui-components | `components/motion/select.tsx`, `select-morph.tsx` | Select composable dont le panneau se déplie du déclencheur | motion, lucide | MIT | Import (correspondance de colonnes), Liste |
| ui-components | `components/motion/shader-background.tsx` | Fonds shader | `@paper-design/shaders-react`, motion | MIT | — |
| ui-components | `components/motion/signup-form.tsx` | Formulaire d'inscription composé | motion, lucide | MIT | — |
| ui-components | `components/motion/sortable-list.tsx` (+ `sortable-stack.tsx` réexport) | Liste triable par glisser (motion `Reorder`), poignée, réordonnancement clavier, annonces, annuler | motion, lucide | MIT | Kanban (inspiration, une seule liste) |
| ui-components | `components/motion/switch.tsx` | Interrupteur à ressort | motion | MIT | Réglages (alternative) |
| ui-components | `components/motion/table/` | Tableau virtualisé (10k+ lignes) : tri, sélection, redimensionnement/réordonnancement de colonnes, cellules éditables, chargement asynchrone | motion, lucide, react-dom, `@tanstack/react-virtual` | MIT | Liste (alternative grand volume) |
| ui-components | `components/motion/theme-toggle.tsx` | Bascule de thème via View Transition API | motion, lucide, next-themes | MIT | — |
| ui-components | `components/motion/timeline.tsx` | Frise horizontale déplaçable autour d'une carte focalisée | motion | MIT | — (inadaptée à un historique vertical) |
| ui-components | `components/motion/tooltip.tsx` + `tooltip/` + `tooltip-surface.tsx` | Infobulle survol/focus/tap, anti-collision | motion, react-dom, fui | MIT | Global, Stats |
| ui-components | `components/charts/bar-chart.tsx` + `bar-chart/` | Barres groupées/empilées/horizontales qui poussent et se réordonnent | motion, tooltip→fui | MIT | Stats (actions par jour) |
| ui-components | `components/charts/line-chart.tsx` + `line-chart/` + `xy/` | Courbes/aires qui se transforment, réticule, infobulles ; `xy/data-table.tsx` (tableau accessible) | motion, react-dom | MIT | Stats (évolution) |
| ui-components | `components/charts/funnel-chart.tsx` + `funnel-chart/model.ts` | Entonnoir vertical/horizontal à étapes courbes et infobulles chiffrées | motion, tooltip→fui, number-ticker | MIT | Stats (entonnoir) |
| ui-components | `components/charts/sparkline.tsx` | Tendance compacte avec badge de variation | motion | MIT | En-tête, Stats (cartes chiffres) |
| ui-components | `components/charts/donut-chart.tsx` + `donut-chart/` | Donut à segments arrondis, centre et légende liés | motion | MIT | Stats (répartition par étape) |
| ui-components | `components/charts/status-bar.tsx` + `status-bar/` | Historique d'état en barres arrondies | motion, tooltip→fui | MIT | Stats/En-tête (historique quotas, option) |
| ui-components | `components/charts/composition-chart.tsx`, `heat-calendar.tsx`, `treemap.tsx`, `sankey-chart.tsx`, `bump-chart.tsx` | Parts empilées, calendrier d'activité, treemap, Sankey, classements | motion, tooltip→fui | MIT | Stats (heat-calendar et sankey en option) |
| ui-components | `components/charts/candlestick-chart.tsx`, `liquidity-heatmap.tsx`, `order-book.tsx`, `price-target-fan.tsx`, `returns-calendar.tsx`, `volume-profile.tsx` | Graphiques financiers | motion, tooltip→fui | MIT | — |
| ui-components | `components/agents/message.tsx`, `message-bubble.tsx`, `message-scroller.tsx`, `message-context.tsx` | Fil de conversation : groupes, avatars, en-tête/pied (état de remise), indicateur de saisie, défilement qui suit le bord | motion, lucide ; interne preview-rail | MIT | Inbox (fil) |
| ui-components | `components/agents/prompt-input.tsx` | Zone de saisie de prompt (modèles, actions) | motion, lucide ; internes button, select, popover-morph | MIT | Inbox (inspiration composer) |
| ui-components | `components/agents/chat-app.tsx` | Espace de conversation complet (navigation + messages) | interne animated-sidebar | MIT | Inbox (inspiration mise en page) |
| ui-components | `components/agents/agent-activity/`, `approval-card/`, `loading-states/`, `todo-list.tsx`, `tool-approval.tsx`, `tool-result.tsx`, `agent-disclosure.tsx` | Activité d'agent, validation, états de chargement, liste de tâches d'agent | motion, lucide | MIT | — (inspiration : todo-list pour la File) |
| ui-components | `components/agents/agent-code.tsx`, `code-block.tsx`, `file-diff.tsx`, `citations.tsx`, `streaming-response.tsx`, `image-generation.tsx`, `voice-orb.tsx` (+ `voice-orb/`) | Code (Shiki), diff, citations (favicons externes), réponse en flux, génération d'image, orbe vocal | motion, lucide, shiki | MIT | — |
| ui-components | `components/app/`, `components/previews/` | Habillage du site et démos d'usage | divers | MIT | — |

### 3.4 interior (`components/interior/`, catalogue `lib/registry.ts`, démos `lib/demos/`)

Toutes les lignes : dépendances `motion` (+ `react-dom` quand indiqué), licence MIT, `prefers-reduced-motion` géré.

| Dépôt | Chemin | Rôle | Dépendances | Licence | Écran cible |
|---|---|---|---|---|---|
| interior | `components/interior/accordion.tsx` | Accordéon, `height: auto` correct | motion | MIT | Fiche, Réglages |
| interior | `components/interior/blur-up-image.tsx` | Image qui se défloute au chargement | motion | MIT | Fiche (photo de profil) |
| interior | `components/interior/collapsible-banner.tsx` | Bandeau qui se replie à son titre ou disparaît | motion | MIT | En-tête (bandeau « file gelée / quota atteint ») |
| interior | `components/interior/command-palette.tsx` | Palette de commandes, résultats réordonnés | motion, react-dom | MIT | Global (option) |
| interior | `components/interior/context-menu.tsx` | Menu contextuel depuis le pointeur | motion, react-dom | MIT | Liste, Kanban |
| interior | `components/interior/copy-button.tsx` | Copier → coche, largeur verrouillée | motion | MIT | Fiche (copier l'URL LinkedIn) |
| interior | `components/interior/drawer.tsx` | Panneau latéral qui garde sa place : modal ou non, focus rendu au déclencheur, Échap, `inert`, fermeture par glisser | motion, react-dom | MIT | **Fiche** |
| interior | `components/interior/dropdown.tsx` | Menu déroulant à surbrillance qui voyage | motion | MIT | Liste, Kanban (« Déplacer vers… ») |
| interior | `components/interior/expanding-search.tsx` | Icône qui devient champ de recherche | motion | MIT | Liste |
| interior | `components/interior/filter-grid.tsx` | Grille filtrée qui se réarrange (un filtre actif, compteurs) | motion | MIT | Liste (inspiration) |
| interior | `components/interior/floating-label.tsx` | Libellé flottant | motion | MIT | Réglages, Import |
| interior | `components/interior/hide-on-scroll.tsx` | Barre qui s'efface au défilement | motion | MIT | — (l'en-tête quotas doit rester visible) |
| interior | `components/interior/hold-to-confirm.tsx` | Maintenir pour confirmer une action destructive | motion | MIT | Réglages (option « Reprendre après gel ») |
| interior | `components/interior/icon-morph.tsx` | Icônes play/pause, menu/fermer en un seul mécanisme | motion | MIT | En-tête (pause/reprise de la file) |
| interior | `components/interior/inline-validation.tsx` | Message d'erreur qui ne pousse pas le formulaire | motion | MIT | Réglages, Import |
| interior | `components/interior/lightbox.tsx` | Zoom qui revient à son origine | motion, react-dom | MIT | — |
| interior | `components/interior/like-burst.tsx` | Like optimiste résistant aux tapotements | motion | MIT | — |
| interior | `components/interior/live-activity.tsx` | Travail en cours du système porté comme un petit objet (running/success/error) | motion | MIT | En-tête (option état de la file) |
| interior | `components/interior/load-more.tsx` | Sentinelle qui charge avant la fin | motion | MIT | Liste, Inbox |
| interior | `components/interior/loading-button.tsx` | Bouton d'action asynchrone sans décalage de mise en page (idle/pending/success/error) | motion | MIT | Inbox (envoi), File (annuler) |
| interior | `components/interior/logo-marquee.tsx` | Défilement de logos | motion | MIT | — |
| interior | `components/interior/long-press.tsx` | Appui long confirmé par le temps | motion | MIT | — |
| interior | `components/interior/modal.tsx` | Modale : fond, verrou de défilement, piège de focus | motion, react-dom | MIT | Global (confirmations) |
| interior | `components/interior/new-items-pill.tsx` | Pastille « nouveaux éléments » sans voler le défilement | motion | MIT | Inbox (nouveaux messages) |
| interior | `components/interior/otp-input.tsx` | Saisie OTP | motion | MIT | — |
| interior | `components/interior/pagination.tsx` | Pagination où la fenêtre bouge, pas la ligne | motion | MIT | Liste |
| interior | `components/interior/password-strength.tsx` | Force du mot de passe par segments | motion | MIT | — |
| interior | `components/interior/poll-results.tsx` | Résultats de sondage | motion | MIT | — |
| interior | `components/interior/popover.tsx` | Popover qui connaît son origine et se retourne | motion | MIT | Global |
| interior | `components/interior/presence-avatars.tsx` | Avatars de présence | motion | MIT | — |
| interior | `components/interior/press-depth.tsx` | Sensation d'appui | motion | MIT | Global (boutons) |
| interior | `components/interior/progress-bar.tsx` | Barre indéterminée puis déterminée, valeurs ARIA | motion | MIT | **En-tête (jauges de quotas)**, Import |
| interior | `components/interior/reading-progress.tsx` | Progression de lecture | motion | MIT | — |
| interior | `components/interior/reorder-list.tsx` | Réordonnancement : l'espace ouvert est la cible ; saisie/dépôt au clavier avec annonces | motion | MIT | Kanban (inspiration accessibilité) |
| interior | `components/interior/ripple.tsx` | Onde depuis le pointeur | motion | MIT | — |
| interior | `components/interior/scroll-spy.tsx` | Section courante | motion | MIT | — |
| interior | `components/interior/segmented-control.tsx` | Contrôle segmenté, pouce qui glisse | motion | MIT | Liste ↔ Kanban, Stats (jour/semaine/mois) |
| interior | `components/interior/show-more.tsx` | Afficher plus | motion | MIT | Fiche, Inbox |
| interior | `components/interior/skeleton-swap.tsx` | Squelette → contenu sans décalage | motion | MIT | Liste, Fiche, Stats |
| interior | `components/interior/slider-detents.tsx` | Curseur à crans | motion | MIT | Réglages (option) |
| interior | `components/interior/snap-carousel.tsx` | Carrousel aimanté | motion | MIT | — |
| interior | `components/interior/sortable-table.tsx` | Tableau triable dont les lignes voyagent vers leur nouvel ordre ; hook `useSortableRows` | motion | MIT | **Liste** |
| interior | `components/interior/sticky-header.tsx` | En-tête collant qui se condense | motion | MIT | En-tête (option) |
| interior | `components/interior/streaming-text.tsx` | Texte jeton par jeton avec caret | motion | MIT | — |
| interior | `components/interior/swipe-deck.tsx` | Pile de cartes à trier par balayage | motion | MIT | — |
| interior | `components/interior/tabs.tsx` | Onglets à indicateur partagé | motion | MIT | Fiche (sections), Stats |
| interior | `components/interior/tag-input.tsx` | Saisie d'étiquettes | motion | MIT | Fiche (tags, option) |
| interior | `components/interior/task-steps.tsx` | Étapes pending/active/done/error narrées | motion | MIT | Import (étapes d'import) |
| interior | `components/interior/text-reveal.tsx` | Mots dans l'ordre de lecture | motion | MIT | — |
| interior | `components/interior/tooltip-group.tsx` | Infobulles : délai la première fois, instantanées ensuite | motion | MIT | Global |
| interior | `components/interior/tree-view.tsx` | Arborescence navigable au clavier | motion | MIT | — |
| interior | `components/interior/typing-indicator.tsx` | Indicateur « en train d'écrire » | motion | MIT | — (LinkedIn n'expose pas cette info) |
| interior | `components/interior/value-flash.tsx` | Signale une valeur qui vient de changer (hausse/baisse) | motion | MIT | En-tête, File (heure de départ estimée) |
| interior | `components/interior/wizard-steps.tsx` | Assistant à étapes qui distingue avant/arrière | motion | MIT | Import (assistant) |
| interior | `components/site/`, `components/docs/`, `app/` | Site de documentation | @phosphor-icons/react, shiki, @vercel/analytics | MIT | — |

### 3.5 ai-design-skills

| Dépôt | Chemin | Rôle | Dépendances | Licence | Écran cible |
|---|---|---|---|---|---|
| ai-design-skills | `skills/landing-page-design/SKILL.md` | Système visuel (typo, espacements, rayons, couleurs, mouvement, états, contenu) + méthode landing page | aucune | MIT | Global (principes, §2) |
| ai-design-skills | `skills/figma-designer/SKILL.md` | Règles de conception Figma : jetons à deux couches, styles de texte, contraste, états | aucune | MIT | Global (principes, §2) |
| ai-design-skills | `scripts/validate_skills.py`, `tests/`, `.github/` | Validation des skills du dépôt | Python | MIT | — (non exécuté) |

---

## 4. Choix par besoin

Principe : préférer interior (une seule dépendance, `motion`, et hooks headless faciles à rhabiller) puis ui-components (même dépendance, plus de surfaces prêtes) et transitions.dev (CSS pur) ; écrire nous-mêmes quand rien ne convient. Toute copie se fait par relecture manuelle du fichier (pas de CLI shadcn, pas de MCP), avec notice de licence en tête et revue sécurité (code tiers non fiable).

Adaptation commune à tous les choix :
- Remplacer les couleurs codées en dur (interior : `#4568FF`, gris stone ; ui-components : jetons shadcn) par nos jetons sémantiques Tailwind 4 (`--color-accent: #e0625a`, `--color-surface: #f5f2f2`, `--color-action: #b5443d` pour boutons pleins et liens, à valider).
- Envelopper l'application dans `<MotionConfig reducedMotion="user">` en plus du `useReducedMotion` déjà présent dans les composants ; en mode réduit, ne garder qu'un fondu d'opacité ou aucune animation.
- Durées alignées sur `transitions.dev/skills/transitions-dev/_root.css` (fermeture 150 ms, ouverture 250 ms, panneau ≤ 400 ms) ; une animation ne bloque jamais le clic suivant ni l'appel serveur (l'état change d'abord, l'animation suit).
- Remplacer les icônes `lucide-react` par des SVG en ligne (Phosphor, MIT), conformément à ai-design-skills.
- Traduire tous les libellés et annonces ARIA en français.

| # | Besoin | Choix (dépôt + chemin) | Dépendances ajoutées | Justification (une ligne) | Notes d'adaptation |
|---|---|---|---|---|---|
| 1 | Liste/tableau de prospects filtrable | **interior `components/interior/sortable-table.tsx`** pour le tableau ; **barre de filtres à écrire nous-mêmes** (selects natifs pour statut de relation, étape, liste d'origine ; deux `<input type="date">` pour la date de relance) ; pagination interior `pagination.tsx` si besoin | `motion` | Hook `useSortableRows` headless, tri accessible avec lignes qui glissent, une seule dépendance ; aucun dépôt n'offre de filtres multi-critères (filter-grid n'a qu'un filtre actif). | Filtres portés par les `searchParams` de l'URL et appliqués **côté serveur** (requête Supabase, validation Zod des paramètres) ; ne pas filtrer côté client des données non autorisées. Squelette : interior `skeleton-swap.tsx`. Si le volume dépasse quelques milliers de lignes : ui-components `components/motion/table/` (ajoute `@tanstack/react-virtual`). |
| 2 | Kanban par étape avec glisser-déposer | **À écrire nous-mêmes.** S'inspirer de interior `reorder-list.tsx` (saisie/dépôt clavier, annonces `aria-live`) et de ui-components `sortable-list.tsx` (bouton « Annuler »). | aucune (ou `motion` déjà présent pour `layout`) | Aucun composant ne gère le déplacement **entre colonnes** : `Reorder` de motion ne trie qu'une liste. | Glisser-déposer HTML5 natif ou événements pointeur + alternative clavier obligatoire (menu « Déplacer vers… » via interior `dropdown.tsx`). Mise à jour optimiste avec retour arrière si la Server Action (auth + autorisation + Zod) échoue. Animation d'atterrissage via `motion` `layout`, coupée en reduced-motion. `@dnd-kit` (lourd) **non essentiel** : à n'envisager que si le tactile devient nécessaire. |
| 3 | Fiche prospect en panneau latéral + historique | **interior `components/interior/drawer.tsx`** pour le panneau ; **timeline à écrire nous-mêmes** (`<ol>` + `<time datetime>`), sections repliables avec interior `accordion.tsx` | `motion` | Le drawer interior propose un mode non modal (la liste reste utilisable), rend le focus, gère Échap et `inert` ; ui-components `timeline.tsx` est une frise horizontale de type carrousel, inadaptée. | Largeur ~420 px à droite ; ouverture ≤ 300 ms, fermeture 150 ms ; ouverture pilotée par l'URL (`?prospect=id`) pour garder le lien partageable entre ses propres onglets ; contrôle d'accès serveur sur l'identifiant. Chargement : transitions.dev `14-skeleton-reveal.md`. Copier l'URL LinkedIn : interior `copy-button.tsx`. |
| 4 | Inbox (phase 2) | Fil : **ui-components `components/agents/message.tsx` + `message-bubble.tsx` + `message-scroller.tsx`** ; composer **à écrire** (`<textarea>` + bouton) avec **interior `loading-button.tsx`** pour « envoi en cours » ; nouveaux messages : interior `new-items-pill.tsx` ; liste des conversations à écrire | `motion` (+ lucide à remplacer) | Seul ensemble couvrant groupes de messages, avatars, pied de message (état de remise) et défilement qui suit le bord ; loading-button garde la largeur stable pendant l'envoi. | Retirer la logique « assistant/IA » (`MessageFrom = "user" \| "assistant"` → « moi » / « prospect »). Le texte des messages est du contenu tiers : rendu en texte brut, jamais en HTML. L'envoi réel reste soumis aux quotas et à la file. |
| 5 | Badges de statut de relation et d'étape | **À écrire nous-mêmes** (un `<span>` stylé par jetons), inspiré de ui-components `components/motion/animated-badge.tsx` ; changement d'état animé par transitions.dev `04-text-states-swap.md` | aucune | Un badge est trivial ; animated-badge ajouterait lucide et des jetons shadcn pour peu de valeur. | Toujours libellé + forme/icône, jamais la couleur seule (règle ai-design-skills). Style Caption 3/4 (12 px). Palette d'étapes : nuances neutres + accent réservé à l'état actif ; vérifier 4,5:1 du texte. |
| 6 | Jauge de quotas en tête + état de la file + arrêt d'urgence | Jauges : **interior `components/interior/progress-bar.tsx`** (une par type d'action, onglet jour/semaine/mois via interior `segmented-control.tsx`) ; chiffres : transitions.dev `02-number-pop-in.md` ; état de la file (en cours / en pause / gelé) : badge du besoin 5 + transitions.dev `04-text-states-swap.md` ; bandeau « gelé » : interior `collapsible-banner.tsx` ; **bouton d'arrêt d'urgence à écrire nous-mêmes** | `motion` | progress-bar expose déjà les valeurs ARIA et un remplissage à ressort ; l'arrêt d'urgence doit être instantané, donc sans composant animé. | Passer `role="progressbar"` en `role="meter"` (une jauge de quota n'est pas une progression) ; seuils visibles (80 % : avertissement, 100 % : « quota atteint ») avec texte, pas seulement couleur. En-tête collant, jamais masqué (ne pas utiliser `hide-on-scroll`). **Arrêt d'urgence** : bouton toujours visible, un clic, effet immédiat côté serveur (Server Action authentifiée), aucune animation ni maintien avant l'action ; confirmation **après** coup par toast avec « Reprendre ». Ne **pas** utiliser `hold-to-confirm` pour l'arrêt (il retarde l'action) ; il peut servir à « Reprendre après gel ». |
| 7 | Graphiques et entonnoir des statistiques | **ui-components `components/charts/funnel-chart.tsx` (+ `funnel-chart/model.ts`)** pour l'entonnoir ; **`components/charts/bar-chart.tsx` (+ `bar-chart/`)** pour les actions par période ; `sparkline.tsx` pour les cartes chiffres | `motion` ; `@floating-ui/dom` via `motion/tooltip` (évitable) | Seuls graphiques disponibles en SVG maison sans librairie de charting (pas de recharts/d3) et avec reduced-motion géré. | Remplacer l'infobulle (`components/motion/tooltip`) par une infobulle simple ou une légende fixe pour éviter `@floating-ui/dom`. Fournir un tableau de données accessible (s'inspirer de `charts/xy/data-table.tsx`). Changement de période : transitions.dev `34-text-swap-soft.md`. Alternative zéro dépendance pour un donut : transitions.dev `35-donut-chart.md`. Couleurs : accent pour la série principale, neutres pour le reste. |
| 8 | Transitions entre vues, ouverture de panneaux | **`<ViewTransition>` natif de React 19.3** (documenté dans `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`) pour les changements de vue (Liste ↔ Kanban ↔ Stats) ; jetons et recettes **transitions.dev `_root.css`, `07-panel-reveal.md`, `08-page-side-by-side.md`** ; panneaux : ressort du drawer interior | aucune | Natif, sans dépendance, sans effet si le navigateur ne le supporte pas ; transitions.dev fournit des durées courtes déjà calibrées avec garde reduced-motion. | Durées 150–250 ms, courbe `cubic-bezier(0.22, 1, 0.36, 1)`. Garde `@media (prefers-reduced-motion: reduce)` sur les classes `::view-transition-*`. Ne pas animer la première peinture de l'en-tête quotas. |
| 9 | Notifications / toasts | **ui-components `components/motion/animated-toast-stack.tsx`** | `motion` (+ lucide à remplacer) | Gère `aria-live`, actions (« Reprendre », « Annuler »), durée, pile et **morphing d'état loading → success/error**, idéal pour « envoi en cours » → « envoyé ». | Messages calmes et précis (« Invitation envoyée à Claire Martin », « Quota du jour atteint pour les invitations. Reprise demain à 9 h. », « Action gelée : la file est en pause. »). Erreurs persistantes (durée 0) ; succès 4 s. rare-ui `toast.tsx` écarté (Sonner + figma-squircle + attribution). Alternative zéro dépendance : transitions.dev `22-toast.md` / `32-banner-stacking.md` + logique à écrire. |
| 10 | Formulaires : import CSV, sélecteurs de colonnes, champs bornés, horaires, interrupteur | Import : **ui-components `components/motion/file-upload.tsx`** (variante upload-queue, dropzone + `<input type="file" accept=".csv,text/csv">`) ; étapes : interior `wizard-steps.tsx` ; colonnes : **`<select>` natifs à écrire** ; plafonds : **ui-components `components/motion/adaptive-stepper.tsx`** ; horaires : **ui-components `components/motion/availability-scheduler/`** ; interrupteur : **transitions.dev `27-toggle.md`** sur `<button role="switch">` ; erreurs : interior `inline-validation.tsx` | `motion` ; `@floating-ui/dom` si l'on garde l'infobulle du scheduler | file-upload gère glisser-déposer, file, progression, réessai ; adaptive-stepper rend les bornes min/max visibles ; availability-scheduler est le seul éditeur de plages horaires hebdo ; le toggle transitions.dev est du CSS pur. | Le parsing CSV (papaparse, déjà présent) et la validation (Zod : taille max, nombre de lignes, colonnes attendues, URL LinkedIn) se font **côté serveur** ; ne jamais faire confiance au type MIME client. Neutraliser l'injection de formules (cellules commençant par `= + - @`) à l'export éventuel. Scheduler : jours en français, format 24 h (remplacer `label12`), retirer l'infobulle pour éviter `fui`. Plafonds : bornes répétées dans le schéma Zod serveur. Les selects ui-components sont possibles mais des selects natifs suffisent pour une dizaine de colonnes. |
| 11 | Vue « File d'attente » | **À écrire nous-mêmes** (`<ol>` ordonné : action, prospect, motif d'attente, heure de départ estimée en `<time>`, bouton Annuler) ; Annuler : **interior `loading-button.tsx`** ; changement d'heure estimée : **interior `value-flash.tsx`** ; motif : transitions.dev `04-text-states-swap.md` ; sortie d'une ligne : `motion` `AnimatePresence` | `motion` | Aucun composant ne correspond à une file planifiée ; les briques interior couvrent l'action asynchrone et le signalement de valeur modifiée. | État vide composé (« Aucune action planifiée. ») ; mise à jour périodique ou temps réel sans voler le focus ; l'annulation est une Server Action vérifiant que la tâche appartient à l'utilisateur ; heures affichées en fuseau local. |

---

## 5. Dépendances proposées

Ensemble minimal pour les choix ci-dessus :

| Paquet | Pourquoi | Essentiel ? | Remarques |
|---|---|---|---|
| `motion` (v12, ex-framer-motion) | Seule dépendance de tous les composants interior retenus (drawer, sortable-table, progress-bar, loading-button, value-flash, accordion…) et des composants ui-components retenus (toast stack, charts, file-upload, adaptive-stepper, availability-scheduler, messages). | **Oui**, si l'on reprend ces composants. | Paquet très utilisé et maintenu (à revérifier au moment de l'ajout, et à signaler dans la PR). Alternative : tout réécrire en CSS avec transitions.dev + `<ViewTransition>` natif, faisable pour badges, toggle, toasts et transitions de vue, mais coûteux pour le tableau trié, le drawer et les graphiques. |

À **éviter** (remplacements proposés) :

| Paquet | Tiré par | Remplacement |
|---|---|---|
| `lucide-react` | ui-components (icônes) | SVG en ligne copiés depuis Phosphor (MIT), recommandés par ai-design-skills. |
| `clsx` + `tailwind-merge` | helper `cn()` de ui-components | Petit helper local de concaténation de classes ; adapter les `className` copiés pour éviter les conflits d'utilitaires. À reconsidérer seulement si de nombreux composants ui-components sont repris. |
| `@floating-ui/dom` | `components/motion/tooltip/` (charts, availability-scheduler, avatar-group) | Infobulle simple positionnée en CSS ou légende fixe ; sinon l'accepter (léger, très utilisé). Seule dépendance « optionnelle » de la liste. |
| `@tanstack/react-virtual` | ui-components `table/` | Inutile pour un outil mono-utilisateur : pagination serveur. |
| `@dnd-kit/*` | (Kanban) | Glisser-déposer natif + alternative clavier ; à n'ajouter que si le tactile est requis. |
| `recharts`, `d3` | — | Les graphiques ui-components sont en SVG maison. |
| `@radix-ui/*`, `sonner`, `vaul`, `figma-squircle`, `flubber`, `react-use-measure`, `prism-react-renderer`, `react-apple-emojis` | rare-ui | Aucun composant rare-ui retenu. |
| `lenis`, `shiki`, `next-themes`, `@paper-design/shaders-react` | ui-components (composants non retenus) | Sans objet. |

Déjà présent dans l'application et réutilisé : `papaparse` (parsing CSV côté serveur), `zod` (validation de tous les formulaires et paramètres de filtre).

Obligations de licence résultant de ces choix : notice MIT « Copyright (c) 2026 ozzy » (interior) et « Copyright (c) 2026 Saurabh Chauhan » (ui-components) en tête de chaque fichier copié ou dans un `THIRD_PARTY_NOTICES` ; commentaire d'origine transitions.dev conservé par courtoisie ; aucune obligation rare-ui tant qu'aucun de ses composants n'est copié.
