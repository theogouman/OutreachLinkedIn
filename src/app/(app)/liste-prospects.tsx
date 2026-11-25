"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TableTriable, type Colonne } from "@/components/interface/table-triable";
import { Avatar } from "@/components/interface/elements";
import { useListeFiltree } from "@/components/filtres/use-liste-filtree";
import { FiltresProspects as PanneauFiltres } from "@/components/filtres/filtres-prospects";
import { RechercheRepliable } from "@/components/filtres/recherche-repliable";
import { TriProspects } from "@/components/filtres/tri-prospects";
import { usePublierOrdreFiches } from "@/components/ordre-fiches";
import { FILTRES_PROSPECTS, FILTRES_PROSPECTS_VIDES, trierLocalement, type FiltresProspects } from "@/lib/filtres/prospects";
import { actionListerProspects } from "@/app/actions";
import type { LigneProspect } from "@/server/donnees";
import { BarreVues } from "@/components/vues/barre-vues";
import { GalerieProspects } from "@/components/vues/galerie";
import { KanbanProspects } from "@/components/vues/kanban";
import { ValeurPropriete, valeurPropriete, type ContexteProprietes } from "@/components/vues/proprietes";
import { PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";
import { MISES_EN_PAGE, type Vue } from "@/lib/vues/catalogue";

/** Aucune vue en base (cas anormal) : la table par défaut, sans enregistrement. */
const VUE_SECOURS: Vue = { id: "00000000-0000-4000-8000-000000000000", nom: "Table", type: "table", options: MISES_EN_PAGE.table.defaut };


/**
 * Liste des prospects : indicateurs, filtres et tableau, sur le standard des listes filtrées
 * (useListeFiltree) : résultats instantanés, sans bouton Filtrer, sans changement d'URL.
 */
export function ListeProspects({
  initial,
  filtresInitiaux = FILTRES_PROSPECTS_VIDES,
  etapes,
  listes,
  vues,
  vueInitiale,
  taillePage,
  videSansFiltre,
  charger = actionListerProspects,
}: {
  initial: { lignes: LigneProspect[]; total: number };
  /** Filtres appliqués au chargement (lien direct depuis les cartes de la page Statistiques). */
  filtresInitiaux?: FiltresProspects;
  etapes: { code: string; libelle: string }[];
  listes: string[];
  /** Vues enregistrées (au moins une) et vue ouverte au chargement (?vue=). */
  vues: Vue[];
  vueInitiale: string | null;
  taillePage: number;
  videSansFiltre: ReactNode;
  /** Source des résultats filtrés (l'action serveur ; remplaçable dans les tests). */
  charger?: typeof actionListerProspects;
}) {
  // Ordre des étapes du pipeline, pour le tri local par étape (même règle que le serveur).
  const ordreEtapes = useMemo(() => Object.fromEntries(etapes.map((e, i) => [e.code, i])), [etapes]);
  const trier = useCallback((lignes: LigneProspect[], f: FiltresProspects) => trierLocalement(lignes, f.tri, ordreEtapes), [ordreEtapes]);
  const l = useListeFiltree({
    initial,
    filtresInitiaux,
    definitions: FILTRES_PROSPECTS,
    charger,
    trier,
  });
  usePublierOrdreFiches(l.lignes.map((p) => p.id));
  const f = l.filtres;
  const libellesEtapes = Object.fromEntries(etapes.map((e) => [e.code, e.libelle]));
  const pages = Math.max(1, Math.ceil(l.total / taillePage));
  const ctx: ContexteProprietes = { etapes: libellesEtapes, listes };

  // Vue ouverte : gardée dans l'URL (?vue=) sans recharger la page, pour la retrouver et la partager.
  const [idVue, setIdVue] = useState(vueInitiale);
  const vue = vues.find((v) => v.id === idVue) ?? vues[0] ?? VUE_SECOURS;
  const choisirVue = (id: string) => {
    setIdVue(id);
    const q = new URLSearchParams(window.location.search);
    q.set("vue", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  };
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const ouvrirFiche = (id: string) => {
    const q = new URLSearchParams(params);
    q.set("prospect", id);
    router.push(`${chemin}?${q}`, { scroll: false });
  };

  const aucunResultat = l.lignes.length === 0 && l.actifs === 0 && l.total === 0;

  return (
    <div className="flex flex-col gap-6">
      {l.erreur && (
        <p role="alert" className="rounded-xl bg-accent-doux px-4 py-3 body-6 text-rouge">
          {l.erreur}
        </p>
      )}

      {aucunResultat ? (
        videSansFiltre
      ) : (
        <>
          <BarreVues
            vues={vues}
            active={vue}
            choisir={choisirVue}
            aDroite={
              <div className="flex shrink-0 items-center gap-2" aria-label="Rechercher et filtrer les prospects" role="group">
                <RechercheRepliable valeur={f.recherche ?? ""} changer={(v) => l.changer("recherche", v)} enCours={l.enCours} decalageDroite={96} />
                <PanneauFiltres
                  initiales={filtresInitiaux.conditions}
                  etapes={etapes}
                  listes={listes}
                  changer={(conditions) => l.changer("conditions", conditions)}
                />
                <TriProspects tri={f.tri} changer={(tri) => l.regler("tri", tri)} />
              </div>
            }
          />
          <RenduVue
            vue={vue}
            lignes={l.lignes}
            etapes={etapes}
            ctx={ctx}
            ouvrir={ouvrirFiche}
            apresModification={l.recharger}
            vide={<p className="body-6 text-encre-3">Aucun prospect ne correspond à ces filtres</p>}
          />
          <div className="flex items-center justify-between caption-5 text-encre-3">
            <span aria-live="polite">
              {l.total} prospect{l.total > 1 ? "s" : ""}
              {pages > 1 && ` · page ${f.page} sur ${pages}`}
            </span>
            {pages > 1 && (
              <nav className="flex gap-2" aria-label="Pagination">
                {f.page > 1 && (
                  <button type="button" onClick={() => l.allerPage(f.page - 1)} className="bouton bouton-contour">Précédent</button>
                )}
                {f.page < pages && (
                  <button type="button" onClick={() => l.allerPage(f.page + 1)} className="bouton bouton-contour">Suivant</button>
                )}
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Rendu de la vue ouverte selon son type (catalogue src/lib/vues/catalogue.ts) ; un type ajouté
 * au catalogue sans rendu ici est une erreur de typage. */
function RenduVue({
  vue,
  lignes,
  etapes,
  ctx,
  ouvrir,
  apresModification,
  vide,
}: {
  vue: Vue;
  lignes: LigneProspect[];
  etapes: { code: string; libelle: string }[];
  ctx: ContexteProprietes;
  ouvrir: (id: string) => void;
  apresModification: () => void;
  vide: ReactNode;
}) {
  const proprietes = vue.options.proprietes;
  switch (vue.type) {
    case "table":
      return <TableProspects lignes={lignes} proprietes={proprietes} ctx={ctx} ouvrir={ouvrir} vide={vide} />;
    case "galerie":
      return <GalerieProspects lignes={lignes} proprietes={proprietes} ctx={ctx} ouvrir={ouvrir} vide={vide} />;
    case "kanban":
      return (
        <KanbanProspects lignes={lignes} etapes={etapes} proprietes={proprietes} ctx={ctx} ouvrir={ouvrir} apresDeplacement={apresModification} vide={vide} />
      );
    default: {
      const inconnu: never = vue.type;
      return inconnu;
    }
  }
}

/** Largeur de colonne par propriété (mise en page « Table »). */
const LARGEURS: Record<ClePropriete, string> = {
  entreprise: "minmax(140px, 1.2fr)",
  poste: "minmax(140px, 1.2fr)",
  relation: "150px",
  etape: "150px",
  relance: "110px",
  liste: "minmax(130px, 1fr)",
};

/** Mise en page « Table » : colonne Prospect, puis une colonne par propriété choisie dans la vue. */
export function TableProspects({
  lignes,
  proprietes,
  ctx,
  ouvrir,
  vide,
}: {
  lignes: LigneProspect[];
  proprietes: ClePropriete[];
  ctx: ContexteProprietes;
  ouvrir: (id: string) => void;
  vide?: ReactNode;
}) {
  const nom = (p: LigneProspect) => [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom";
  const colonnes: Colonne<LigneProspect>[] = [
    {
      id: "nom",
      entete: "Prospect",
      largeur: "minmax(220px, 2fr)",
      valeur: (p) => `${p.nom ?? ""} ${p.prenom ?? ""}`,
      cellule: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nom={nom(p)} photo={p.photo} />
          <div className="min-w-0">
            <p className="truncate title-4 text-encre">{nom(p)}</p>
            <p className="truncate caption-5 text-encre-3">{p.poste ?? "Poste inconnu"}</p>
          </div>
        </div>
      ),
    },
    ...proprietes.map(
      (cle): Colonne<LigneProspect> => ({
        id: cle,
        entete: cle === "relance" ? "Relance" : cle === "liste" ? "Liste" : PROPRIETES_PROSPECTS[cle].libelle,
        largeur: LARGEURS[cle],
        valeur: (p) => valeurPropriete(cle, p, ctx),
        cellule: (p) => <ValeurPropriete cle={cle} prospect={p} ctx={ctx} />,
      }),
    ),
  ];

  return <TableTriable lignes={lignes} vide={vide} colonnes={colonnes} idDe={(p) => p.id} libelle="Prospects" surLigne={(p) => ouvrir(p.id)} />;
}
