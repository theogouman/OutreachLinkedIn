# Notices tierces

Composants adaptés à partir de dépôts sous licence MIT (inventaire et choix : `design-refs/INVENTAIRE.md`).

| Fichier | Source | Licence |
|---|---|---|
| `src/components/interface/jauge.tsx` | interior — `components/interior/progress-bar.tsx` | MIT, © 2026 ozzy |
| `src/components/interface/modale.tsx`, `sections-glissantes.tsx`, classes `.t-*` de `globals.css` | Transitions.dev — Modal open/close, Tabs sliding, Page side-by-side, Card resize, Dropdown menu morph (`menu-filtres.tsx`), Skeleton loader and reveal (`avatar-photo.tsx`, paquet npm `transitions-dev` 0.3.0, MIT) | Licence Transitions.dev (usage en produit autorisé), © 2026 Jakub Antalik |
| `src/components/interface/toasts.tsx` | ui-components — `components/motion/animated-toast-stack.tsx` | MIT, © 2026 Saurabh Chauhan |
| `src/components/interface/table-triable.tsx` | interior — `components/interior/sortable-table.tsx` | MIT, © 2026 ozzy |
| `src/components/icones.tsx` et icônes SVG en ligne | Phosphor Icons (`@phosphor-icons/core` 2.1.1) | MIT, © 2020 Phosphor Icons |
| `src/components/charts/`, `src/components/shimmering-text.tsx`, `src/lib/utils.ts` | bklit-ui (registre shadcn @bklit : funnel-chart, heatmap-chart et dépendances) | MIT, © bklit. Modifications : libellés et formats de date en français (heatmap-utils, heatmap-x-axis, heatmap-legend, chart-formatters, libellés de chargement) |
| `src/components/charts/patterns/` | visx (via bklit) | MIT, voir `LICENSE-visx-pattern` |
| `public/logo-glow.svg`, `src/app/icon.svg`, icônes PWA | Logo fourni par l'utilisateur | Propriété de l'utilisateur |
| `src/components/logos.tsx` (logo LinkedIn) | homarr-labs/dashboard-icons — `svg/linkedin.svg` | Apache License 2.0 |
| `src/components/logos.tsx` (logo Google) | selfhst/icons — `svg/google.svg` | CC BY 4.0, © selfh.st |
| Jetons, fond, navigation en pilule, carte de connexion (`globals.css`, `navigation.tsx`, `login/`) | Notion-Club/Infrastructure (dépôt de l'utilisateur) | Usage interne |
| Bouton en relief (`relief-marque`, `globals.css`) | consultant-notion.fr, classe `nc-btn-3d` (projet de l'utilisateur) | Usage interne |
| `src/components/icones-pages.tsx` (icônes des pages) | SF Symbols, Apple, fournies par l'utilisateur dans `public/icons` | Licence Apple SF Symbols (usage prévu pour les plateformes Apple) |
| `src/components/interface/texte-saisie-anime.tsx` (effet « Blur Out Up ») | pixel-point/animate-text — paramètres publiés de l'effet (durées, courbes, décalages) ; code réécrit, rien de copié | Aucune licence trouvée dans le dépôt : seuls des paramètres d'animation sont repris |
| `public/emojis/croix.webp` (emoji animé « Cross Mark », réduit à 128 px) | Tarikul-Islam-Anik/Telegram-Animated-Emojis (emojis animés de Telegram), choisi par l'utilisateur | Aucune licence publiée dans le dépôt ; illustrations d'origine Telegram |
| `src/components/reui/` (filtres, cascader, kanban, badge), `src/components/filtres/filtres-prospects.tsx` et `editeur-periode.tsx` (motifs c-filters-10 et c-calendar-16), `src/components/vues/kanban.tsx` (motif c-kanban-2) | ReUI (registre shadcn @reui, https://reui.io) | MIT, © 2025 Keenthemes Inc. Modifications locales, marquées « Ajout local (OutreachLinkedIn) » : option `groups` (conditions toutes en ET), colonne ET/OU plus étroite et conditions sur deux lignes sur téléphone, identifiant stable du `DndContext` (kanban), `cn` pris dans `src/lib/utils.ts`, gris de survol `bg-accent` écrit `bg-muted` (`accent` est le rouge de la marque) |
| `src/components/interface/ligne-glissante.tsx` (centre de notifications) | beUI Native — « Swipeable List » (https://beui.dev/react-native/swipeable-list, dépôt starc007/beui-native) : règles et valeurs reprises (seuils, élastique, ressorts, largeur des panneaux, repli à la suppression), code réécrit pour le web (événements de pointeur, `motion`) | MIT, © 2026 beUI and Saurabh |
| `src/components/ui/` (button, button-group, popover, tooltip, dropdown-menu, input, scroll-area, separator, spinner, calendar, card) | shadcn/ui, style base-nova (Base UI) | MIT, © 2023 shadcn. Mêmes modifications (`cn`, `bg-accent` → `bg-muted`) |
| Règles de typographie, d'espacement et d'états (`src/app/globals.css`) | ai-design-skills, anti-slop (© 2026 Miqdad Badjuber) | MIT |
| Passes de finition (texte, graisses, couleur, icônes, mouvement) | unslop, Damir Sokolovsky (@heydamir) | CC BY 4.0 |

Texte de la licence MIT :

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of
> the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Rare UI (https://rareui.com)

`src/components/interface/saisie-valeurs.tsx` et `saisie-valeurs-regles.ts` sont adaptés du composant « Duration Picker » de Rare UI (registre `swamimalode07/rare-ui`, `duration-picker`), sur demande de l'utilisateur (2026-11-20) : 1 à N champs bornés au lieu d'heures et minutes, jetons de couleur de l'app, morphing crayon → coche précalculé (flubber retiré), sans `react-use-measure` ni `@radix-ui/react-slot`. Crédit visible exigé par la licence : README du dépôt. L'apparition des chiffres et les squelettes de chargement n'en reprennent que l'idée, réécrite.

Licence de Rare UI (texte intégral) :

> MIT + Commons Clause License Condition v1.0 + Attribution
>
> Copyright (c) 2026 Swami Malode
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of
> this software and associated documentation files (the "Software"), to deal in
> the Software without restriction, including without limitation the rights to
> use, copy, modify, merge, publish, and distribute the Software as part of an
> application, website, or product, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> Attribution Requirement
>
> Any project that ships any part of the Software must credit Rare UI with a
> visible link to https://rareui.com, placed where a visitor or user can find it,
> such as a site footer, an about page, a credits screen or a README. The credit
> and the copyright notice above must not be removed from the source you copied.
>
> Commons Clause Restriction
>
> You may use this Software, including for any commercial purpose, so long as you
> do not sell, sublicense, or redistribute the components themselves, whether
> alone, in a bundle, or as a ported version.
>
> No Warranty
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
