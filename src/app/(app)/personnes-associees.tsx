"use client";

/*
 * « Personnes associées » de la fiche prospect (remplace l'encadré « Identifiant LinkedIn ») :
 * - photos des personnes associées en groupe d'avatars, animation Transitions.dev « Avatar group
 *   hover » (l'avatar survolé monte, ses voisins moins, retour avec rebond) et info-bulle
 *   « Tooltip » (.t-tt) avec le nom ; un clic ouvre sa fiche (par-dessus la même page) ;
 * - bouton « Gérer » : associées (retirer), suggestions de même entreprise (associer), recherche
 *   dans tout le CRM (associer). Actions serveur vérifiées (actionAssocierProspects,
 *   actionDissocierProspect), page rafraîchie ensuite.
 * Le panneau est rendu par un portail en position fixe : la grille de la fiche coupe ce qui déborde.
 */

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { actionAssocierProspects, actionDissocierProspect, actionListerProspects } from "@/app/actions";
import { Avatar } from "@/components/interface/elements";
import { useRetour } from "@/components/interface/toasts";
import { useDansEcran } from "@/components/interface/dans-ecran";
import { IconeFermer, IconePlus } from "@/components/icones";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";
import type { PersonneAssociee } from "@/server/associations";

const MAX_VISIBLES = 5;

/** Courbes et valeurs lues dans les variables CSS (globals.css, « Avatar group hover »). */
function decaler(racine: HTMLElement | null, actif: number | null, sens: "in" | "out") {
  if (!racine) return;
  const cs = getComputedStyle(document.documentElement);
  const nombre = (nom: string, defaut: number) => {
    const v = parseFloat(cs.getPropertyValue(nom));
    return Number.isFinite(v) ? v : defaut;
  };
  const courbe = (nom: string, defaut: string) => cs.getPropertyValue(nom).trim() || defaut;
  const lift = nombre("--avatar-lift", -4);
  const falloff = nombre("--avatar-falloff", 0.45);
  const scale = nombre("--avatar-scale", 1.05);
  const tf = sens === "out" ? courbe("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)") : courbe("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");
  racine.querySelectorAll<HTMLElement>(".t-avatar").forEach((el, i) => {
    // Courbe posée avant les variables : la transition prend celle du moment (montée nette, retour qui rebondit).
    el.style.transitionTimingFunction = tf;
    if (actif === null) {
      el.style.setProperty("--shift", "0px");
      el.style.setProperty("--scale-active", "1");
      return;
    }
    const d = Math.abs(i - actif);
    el.style.setProperty("--shift", `${(lift * Math.pow(falloff, d)).toFixed(3)}px`);
    el.style.setProperty("--scale-active", i === actif ? String(scale) : "1");
  });
}

export function PersonnesAssociees({
  prospectId,
  nom,
  associes,
  suggestions,
}: {
  prospectId: string;
  nom: string;
  associes: PersonneAssociee[];
  suggestions: PersonneAssociee[];
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const groupe = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const [ouvert, setOuvert] = useState(false);

  const ouvrirFiche = (id: string) => {
    const q = new URLSearchParams(params);
    q.set("prospect", id);
    router.replace(`${chemin}?${q}`, { scroll: false });
  };
  const visibles = associes.slice(0, MAX_VISIBLES);
  const reste = associes.length - visibles.length;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {associes.length > 0 ? (
        <div ref={groupe} className="flex items-center -space-x-2" onMouseLeave={() => decaler(groupe.current, null, "out")}>
          {visibles.map((p, i) => (
            <span key={p.id} className="t-avatar t-tt-wrap" onMouseEnter={() => decaler(groupe.current, i, "in")}>
              <button
                type="button"
                onClick={() => ouvrirFiche(p.id)}
                onFocus={() => decaler(groupe.current, i, "in")}
                onBlur={() => decaler(groupe.current, null, "out")}
                aria-label={`Ouvrir la fiche de ${p.nom}`}
                className="t-tt-trigger block rounded-full shadow-[0_0_0_2px_var(--color-carte)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Avatar nom={p.nom} photo={p.photo} taille={28} />
              </button>
              <span role="tooltip" className="t-tt t-tt-droite caption-4">
                {p.nom}
                {p.poste ? <span className="text-encre-3"> · {p.poste}</span> : null}
              </span>
            </span>
          ))}
          {reste > 0 && (
            <span className="relative grid size-7 place-items-center rounded-full bg-creux caption-4 tabular-nums text-encre-2 shadow-[0_0_0_2px_var(--color-carte)]">
              +{reste}
            </span>
          )}
        </div>
      ) : (
        <span className="text-encre-3">{suggestions.length ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""}` : "Aucune"}</span>
      )}
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        aria-label="Gérer les personnes associées"
        title="Gérer les personnes associées"
        className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-trait-fort text-encre-3 outline-none transition-colors duration-150 hover:border-encre-3 hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
      >
        <IconePlus taille={13} />
      </button>
      {ouvert && (
        <PanneauAssociations
          ancre={bouton}
          fermer={() => setOuvert(false)}
          prospectId={prospectId}
          nom={nom}
          associes={associes}
          suggestions={suggestions}
        />
      )}
    </div>
  );
}

function Ligne({ p, action, children }: { p: PersonneAssociee; action: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5">
      <Avatar nom={p.nom} photo={p.photo} taille={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate body-6 text-encre">{p.nom}</span>
        {(p.poste || children) && <span className="block truncate caption-5 text-encre-3">{children ?? p.poste}</span>}
      </span>
      {action}
    </li>
  );
}

function PanneauAssociations({
  ancre,
  fermer,
  prospectId,
  nom,
  associes,
  suggestions,
}: {
  ancre: React.RefObject<HTMLButtonElement | null>;
  fermer: () => void;
  prospectId: string;
  nom: string;
  associes: PersonneAssociee[];
  suggestions: PersonneAssociee[];
}) {
  const support = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const p = support.current;
    const r = ancre.current?.getBoundingClientRect();
    if (!p || !r) return;
    p.style.top = `${r.bottom + 8}px`;
    p.style.right = `${Math.max(16, window.innerWidth - r.right)}px`;
  }, [ancre]);
  const panneau = useDansEcran<HTMLDivElement>(true);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<PersonneAssociee[]>([]);
  const dejaLa = new Set([prospectId, ...associes.map((a) => a.id)]);

  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!panneau.current?.contains(cible) && !ancre.current?.contains(cible)) fermer();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fermer();
      ancre.current?.focus();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap, true);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap, true);
    };
  }, [ancre, fermer, panneau]);

  // Recherche dans tout le CRM (même action que la liste Prospects), 250 ms après la frappe.
  useEffect(() => {
    const t = recherche.trim();
    if (t.length < 2) return;
    let actuel = true;
    const minuteur = window.setTimeout(async () => {
      const r = await actionListerProspects({ recherche: t, page: 1 });
      if (!actuel || !r.ok) return;
      setResultats(
        r.lignes.slice(0, 8).map((p) => ({ id: p.id, nom: [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom", poste: p.poste, photo: p.photo })),
      );
    }, 250);
    return () => {
      actuel = false;
      window.clearTimeout(minuteur);
    };
  }, [recherche]);

  const associer = (autreId: string) => demarrer(async () => retourner(await actionAssocierProspects({ prospectId, autreId })));
  const retirer = (id: string) => demarrer(async () => retourner(await actionDissocierProspect(id)));
  const bouton = (libelle: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      disabled={enCours}
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 caption-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
        danger ? "text-rouge hover:bg-accent-doux" : "bg-creux text-encre hover:bg-encre/[0.08]"
      }`}
    >
      {libelle}
    </button>
  );
  const resultatsVisibles = recherche.trim().length >= 2 ? resultats.filter((p) => !dejaLa.has(p.id)) : [];

  return createPortal(
    <div ref={support} className="fixed z-[80]">
      <div
        ref={panneau}
        role="dialog"
        aria-label={`Personnes associées à ${nom}`}
        className="flottant dans-ecran flex max-h-[min(480px,70dvh)] w-[min(340px,calc(100vw-32px))] animate-apparition flex-col gap-2 overflow-y-auto rounded-[18px] p-2"
      >
        <div className="flex items-center justify-between px-2 pt-1">
          <p className="title-4 text-encre">Personnes associées</p>
          <button type="button" onClick={fermer} aria-label="Fermer" className="grid size-7 place-items-center rounded-full text-encre-3 hover:bg-creux hover:text-encre">
            <IconeFermer taille={13} />
          </button>
        </div>
        {associes.length > 0 && (
          <ul aria-label="Associées">
            {associes.map((p) => (
              <Ligne key={p.id} p={p} action={bouton("Retirer", () => retirer(p.id), true)} />
            ))}
          </ul>
        )}
        {suggestions.length > 0 && (
          <section className="flex flex-col">
            <p className="px-2 pb-0.5 caption-4 text-encre-3">Même entreprise</p>
            <ul aria-label="Suggestions">
              {suggestions.map((p) => (
                <Ligne key={p.id} p={p} action={bouton("Associer", () => associer(p.id))} />
              ))}
            </ul>
          </section>
        )}
        <label className="relative mx-1 mb-1 block">
          <span className="sr-only">Chercher une personne du CRM</span>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            maxLength={100}
            autoComplete="off"
            className="champ py-2"
          />
          <TexteSaisieAnime valeur={recherche} placeholder="Chercher une personne du CRM" />
        </label>
        {resultatsVisibles.length > 0 && (
          <ul aria-label="Résultats">
            {resultatsVisibles.map((p) => (
              <Ligne key={p.id} p={p} action={bouton("Associer", () => associer(p.id))} />
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
