"use client";

/*
 * Barre des vues (comme les vues d'une base Notion) : un onglet par vue enregistrée, « + » pour
 * en créer une en choisissant une mise en page du catalogue (src/lib/vues/catalogue.ts), et le
 * menu de la vue active : renommer, propriétés affichées, supprimer. Chaque changement passe par
 * une action serveur vérifiée ; la vue active est gardée dans l'URL (?vue=), partageable.
 */

import { useEffect, useRef, useState, useTransition, type ComponentType, type ReactNode, type SVGProps } from "react";
import { actionCreerVue, actionReglerVue, actionRenommerVue, actionSupprimerVue } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { useDansEcran } from "@/components/interface/dans-ecran";
import { IconeGalerie, IconeOptions, IconePlus, IconeTable } from "@/components/icones";
import { MISES_EN_PAGE, TYPES_VUE, type TypeVue, type Vue } from "@/lib/vues/catalogue";
import { CLES_PROPRIETES, PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";

type Icone = ComponentType<SVGProps<SVGSVGElement> & { taille?: number }>;
export const ICONES_VUE: Record<TypeVue, Icone> = { table: IconeTable, galerie: IconeGalerie };

/** Panneau ancré sous un bouton, fermé au clic dehors ou par Échap. */
function Panneau({
  ouvert,
  fermer,
  ancre,
  libelle,
  children,
  droite = false,
}: {
  ouvert: boolean;
  fermer: () => void;
  ancre: React.RefObject<HTMLElement | null>;
  libelle: string;
  children: ReactNode;
  droite?: boolean;
}) {
  const panneau = useDansEcran<HTMLDivElement>(ouvert);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!panneau.current?.contains(cible) && !ancre.current?.contains(cible)) fermer();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fermer();
        ancre.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer, ancre, panneau]);
  if (!ouvert) return null;
  return (
    <div
      ref={panneau}
      role="dialog"
      aria-label={libelle}
      className={`flottant dans-ecran absolute top-[calc(100%+8px)] z-30 flex w-[min(300px,calc(100vw-32px))] animate-apparition flex-col overflow-y-auto rounded-[18px] p-2 ${droite ? "right-0" : "left-0"}`}
    >
      {children}
    </div>
  );
}

export function BarreVues({ vues, active, choisir }: { vues: Vue[]; active: Vue; choisir: (id: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div role="tablist" aria-label="Vues des prospects" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {vues.map((v) => {
          const Icone = ICONES_VUE[v.type];
          const actif = v.id === active.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={actif}
              onClick={() => choisir(v.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 caption-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent ${
                actif ? "bg-encre/[0.07] text-encre" : "text-encre-3 hover:bg-encre/[0.04] hover:text-encre-2"
              }`}
            >
              <Icone taille={15} />
              <span className="max-w-[160px] truncate">{v.nom}</span>
            </button>
          );
        })}
      </div>
      <NouvelleVue choisir={choisir} />
      <span className="flex-1" />
      <MenuVue key={active.id} vue={active} peutSupprimer={vues.length > 1} apresSuppression={() => choisir(vues.find((v) => v.id !== active.id)!.id)} />
    </div>
  );
}

function NouvelleVue({ choisir }: { choisir: (id: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const bouton = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative shrink-0">
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-label="Nouvelle vue"
        title="Nouvelle vue"
        className="grid size-8 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-encre/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent aria-expanded:bg-encre/[0.05]"
      >
        <IconePlus taille={15} />
      </button>
      <Panneau ouvert={ouvert} fermer={() => setOuvert(false)} ancre={bouton} libelle="Nouvelle vue">
        <p className="px-2.5 pb-1 pt-1.5 caption-4 text-encre-3">Choisir une mise en page</p>
        {TYPES_VUE.map((type) => {
          const Icone = ICONES_VUE[type];
          const m = MISES_EN_PAGE[type];
          return (
            <button
              key={type}
              type="button"
              disabled={enCours}
              onClick={() =>
                demarrer(async () => {
                  const r = await actionCreerVue({ nom: m.libelle, type });
                  retourner(r);
                  if (r.ok && r.id) {
                    setOuvert(false);
                    choisir(r.id);
                  }
                })
              }
              className="flex items-start gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors duration-150 hover:bg-creux focus-visible:bg-creux disabled:opacity-60"
            >
              <span className="mt-0.5 text-encre-2">
                <Icone taille={18} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="body-6 text-encre">{m.libelle}</span>
                <span className="caption-5 text-encre-3">{m.description}</span>
              </span>
            </button>
          );
        })}
      </Panneau>
    </div>
  );
}

function MenuVue({ vue, peutSupprimer, apresSuppression }: { vue: Vue; peutSupprimer: boolean; apresSuppression: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(vue.nom);
  const [proprietes, setProprietes] = useState<ClePropriete[]>(vue.options.proprietes);
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const bouton = useRef<HTMLButtonElement>(null);

  const basculer = (cle: ClePropriete) => {
    // Ordre du catalogue conservé : l'affichage reste stable quelle que soit la sélection.
    const suivantes = CLES_PROPRIETES.filter((c) => (c === cle ? !proprietes.includes(c) : proprietes.includes(c)));
    const avant = proprietes;
    setProprietes(suivantes);
    demarrer(async () => {
      const r = await actionReglerVue({ id: vue.id, options: { proprietes: suivantes } });
      if (!r.ok) {
        setProprietes(avant);
        retourner(r);
      }
    });
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={bouton}
        type="button"
        onClick={() => {
          setOuvert((o) => !o);
          setConfirmer(false);
        }}
        aria-expanded={ouvert}
        aria-label={`Réglages de la vue ${vue.nom}`}
        title="Réglages de la vue"
        className="grid size-8 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-encre/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent aria-expanded:bg-encre/[0.05]"
      >
        <IconeOptions taille={18} />
      </button>
      <Panneau ouvert={ouvert} fermer={() => setOuvert(false)} ancre={bouton} libelle={`Réglages de la vue ${vue.nom}`} droite>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nom.trim() === vue.nom) return;
            demarrer(async () => retourner(await actionRenommerVue({ id: vue.id, nom })));
          }}
          className="flex flex-col gap-1.5 px-2.5 pb-2 pt-1.5"
        >
          <label htmlFor={`nom-${vue.id}`} className="caption-4 text-encre-3">
            Nom de la vue
          </label>
          <input
            id={`nom-${vue.id}`}
            value={nom}
            maxLength={60}
            onChange={(e) => setNom(e.target.value)}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            className="champ py-2"
          />
        </form>
        <fieldset className="flex flex-col border-t border-trait px-1 pt-2">
          <legend className="px-1.5 pb-1 caption-4 text-encre-3">Propriétés affichées</legend>
          {CLES_PROPRIETES.map((cle) => (
            <label key={cle} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1.5 py-1.5 body-6 text-encre hover:bg-creux">
              <span>{PROPRIETES_PROSPECTS[cle].libelle}</span>
              <input type="checkbox" checked={proprietes.includes(cle)} onChange={() => basculer(cle)} className="size-4 accent-[var(--color-accent)]" />
            </label>
          ))}
        </fieldset>
        {peutSupprimer && (
          <div className="mt-2 border-t border-trait px-1 pt-2">
            {confirmer ? (
              <div className="flex items-center justify-between gap-2 px-1.5 py-1">
                <span className="caption-5 text-encre-2">Supprimer « {vue.nom} » ?</span>
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() =>
                    demarrer(async () => {
                      const r = await actionSupprimerVue(vue.id);
                      retourner(r);
                      if (r.ok) {
                        setOuvert(false);
                        apresSuppression();
                      }
                    })
                  }
                  className="bouton bouton-plein px-3 py-1.5 caption-3"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmer(true)}
                className="w-full rounded-xl px-1.5 py-1.5 text-left body-6 text-rouge outline-none hover:bg-accent-doux focus-visible:bg-accent-doux"
              >
                Supprimer la vue
              </button>
            )}
          </div>
        )}
      </Panneau>
    </div>
  );
}
