"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TableTriable, type Colonne } from "@/components/interface/table-triable";
import { Avatar, Chiffre } from "@/components/interface/elements";
import { IconeFermer, IconeRecherche } from "@/components/icones";
import { useListeFiltree } from "@/components/filtres/use-liste-filtree";
import { usePublierOrdreFiches } from "@/components/ordre-fiches";
import { FILTRES_PROSPECTS, FILTRES_PROSPECTS_VIDES } from "@/lib/filtres/prospects";
import { LIBELLES_STATUT } from "@/lib/statut-relation";
import { actionListerProspects } from "@/app/actions";
import type { LigneProspect, StatsProspects } from "@/server/donnees";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";
import { BarreVues } from "@/components/vues/barre-vues";
import { GalerieProspects } from "@/components/vues/galerie";
import { ValeurPropriete, valeurPropriete, type ContexteProprietes } from "@/components/vues/proprietes";
import { PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";
import { MISES_EN_PAGE, type Vue } from "@/lib/vues/catalogue";

/** Aucune vue en base (cas anormal) : la table par défaut, sans enregistrement. */
const VUE_SECOURS: Vue = { id: "00000000-0000-4000-8000-000000000000", nom: "Table", type: "table", options: MISES_EN_PAGE.table.defaut };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * Liste des prospects : indicateurs, filtres et tableau, sur le standard des listes filtrées
 * (useListeFiltree) : résultats instantanés, sans bouton Filtrer, sans changement d'URL.
 */
export function ListeProspects({
  initial,
  stats,
  etapes,
  listes,
  vues,
  vueInitiale,
  taillePage,
  videSansFiltre,
  charger = actionListerProspects,
}: {
  initial: { lignes: LigneProspect[]; total: number };
  stats: StatsProspects;
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
  const l = useListeFiltree({
    initial,
    filtresInitiaux: FILTRES_PROSPECTS_VIDES,
    definitions: FILTRES_PROSPECTS,
    charger,
  });
  usePublierOrdreFiches(l.lignes.map((p) => p.id));
  const f = l.filtres;
  const libellesEtapes = Object.fromEntries(etapes.map((e) => [e.code, e.libelle]));
  const pages = Math.max(1, Math.ceil(l.total / taillePage));
  const basculer = (cle: "statut" | "relanceAvant", valeur: string) => l.changer(cle, f[cle] === valeur ? "" : valeur);
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

  const cartes = [
    { libelle: "En relation", valeur: stats.parStatut.en_relation, aide: `sur ${stats.total} prospects`, actif: f.statut === "en_relation", agir: () => basculer("statut", "en_relation") },
    { libelle: "Invitations en attente", valeur: stats.parStatut.en_attente, aide: "acceptation non reçue", actif: f.statut === "en_attente", agir: () => basculer("statut", "en_attente") },
    { libelle: "Réponses à traiter", valeur: stats.aTraiter, aide: "dernier message reçu", href: "/inbox?filtre=a_traiter", accent: stats.aTraiter > 0 },
    { libelle: "Relances dues", valeur: stats.relancesDues, aide: "aujourd'hui ou en retard", actif: !!f.relanceAvant && f.relanceAvant === aujourdhui(), agir: () => basculer("relanceAvant", aujourdhui()), accent: stats.relancesDues > 0 },
  ];
  const classeCarte = (actif?: boolean) =>
    `carte flex min-w-0 flex-col gap-2 p-4 text-left sm:gap-3 sm:p-5 outline-none transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-creux focus-visible:shadow-[0_0_0_3px_rgba(224,98,90,0.35)] ${actif ? "shadow-[inset_0_0_0_2px_var(--color-accent)]" : ""}`;
  const contenuCarte = (c: (typeof cartes)[number]) => (
    <>
      <span className="body-6 text-encre-2">{c.libelle}</span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Chiffre valeur={c.valeur} className={`chiffre-cle ${c.accent ? "text-rouge" : "text-encre"}`} />
        <span className="caption-5 text-encre-3">{c.aide}</span>
      </span>
    </>
  );

  const champ = "champ w-auto";
  const aucunResultat = l.lignes.length === 0 && l.actifs === 0 && l.total === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cartes.map((c) =>
          c.href ? (
            <Link key={c.libelle} href={c.href} className={classeCarte()}>
              {contenuCarte(c)}
            </Link>
          ) : (
            <button key={c.libelle} type="button" onClick={c.agir} aria-pressed={c.actif} className={classeCarte(c.actif)}>
              {contenuCarte(c)}
            </button>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filtrer les prospects">
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Rechercher un prospect</span>
          <IconeRecherche taille={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-3" />
          <input
            type="search"
            value={f.recherche ?? ""}
            onChange={(e) => l.changer("recherche", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && f.recherche) {
                e.preventDefault();
                l.changer("recherche", "");
              }
            }}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            className="champ pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
          <TexteSaisieAnime valeur={f.recherche ?? ""} placeholder="Rechercher" />
          <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
            {l.enCours ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-trait border-t-accent" role="status" aria-label="Chargement des résultats" />
            ) : (
              f.recherche && (
                <button
                  type="button"
                  onClick={() => l.changer("recherche", "")}
                  aria-label="Effacer la recherche"
                  className="grid size-6 place-items-center rounded-full text-encre-3 outline-none hover:bg-encre/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <IconeFermer taille={12} />
                </button>
              )
            )}
          </span>
        </label>
        <label>
          <span className="sr-only">Relation</span>
          <select value={f.statut ?? ""} onChange={(e) => l.changer("statut", e.target.value)} className={champ}>
            <option value="">Toutes les relations</option>
            {Object.entries(LIBELLES_STATUT).map(([code, libelle]) => (
              <option key={code} value={code}>{libelle}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Étape</span>
          <select value={f.etape ?? ""} onChange={(e) => l.changer("etape", e.target.value)} className={champ}>
            <option value="">Toutes les étapes</option>
            {etapes.map((e) => (
              <option key={e.code} value={e.code}>{e.libelle}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Liste d&apos;origine</span>
          <select value={f.liste ?? ""} onChange={(e) => l.changer("liste", e.target.value)} className={champ}>
            <option value="">Toutes les listes</option>
            {listes.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="caption-4 text-encre-3">Relance avant le</span>
          <input type="date" value={f.relanceAvant ?? ""} onChange={(e) => l.changer("relanceAvant", e.target.value)} className={champ} />
        </label>
        {l.actifs > 0 && (
          <button type="button" onClick={l.reinitialiser} className="bouton bouton-discret">
            Réinitialiser
          </button>
        )}
      </div>

      {l.erreur && (
        <p role="alert" className="rounded-xl bg-accent-doux px-4 py-3 body-6 text-rouge">
          {l.erreur}
        </p>
      )}

      {aucunResultat ? (
        videSansFiltre
      ) : (
        <>
          <BarreVues vues={vues} active={vue} choisir={choisirVue} />
          {vue.type === "galerie" ? (
            <GalerieProspects
              lignes={l.lignes}
              proprietes={vue.options.proprietes}
              ctx={ctx}
              ouvrir={ouvrirFiche}
              vide={<p className="body-6 text-encre-3">Aucun prospect ne correspond à ces filtres</p>}
            />
          ) : (
            <TableProspects
              lignes={l.lignes}
              proprietes={vue.options.proprietes}
              ctx={ctx}
              ouvrir={ouvrirFiche}
              vide={<p className="body-6 text-encre-3">Aucun prospect ne correspond à ces filtres</p>}
            />
          )}
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
