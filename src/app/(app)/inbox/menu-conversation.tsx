"use client";

/*
 * Menu « ⋯ » d'une conversation, le même dans la liste (au survol d'une ligne, sur ordinateur) et
 * dans l'en-tête de la conversation ouverte : marquer comme non lue (ou lue), copier (second menu :
 * profil, conversation, ou les deux, en texte brut), ajouter au CRM (personne hors CRM : la fiche
 * créée s'ouvre), ne plus afficher (ou réafficher, filtre « Masquées »), supprimer (avec
 * confirmation ; rien n'est supprimé sur LinkedIn). Panneaux ancrés gardés dans l'écran (`useDansEcran`), Échap et clic
 * extérieur ferment, le focus revient au bouton.
 */

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { actionMarquerLue, actionMarquerNonLue, actionSupprimerConversation, actionTexteCopie } from "@/app/actions";
import { useActionsInterlocuteur } from "./actions-interlocuteur";
import { IconeAfficher, IconeAjouterPersonne, IconeMasquer, IconeOptions } from "@/components/icones";
import { IconeCopier, IconeCorbeille, IconeEnveloppeOuverte } from "@/components/icones-pages";
import { useRetour } from "@/components/interface/toasts";
import { useDansEcran } from "@/components/interface/dans-ecran";

type Contenu = "profil" | "conversation" | "tout";
const COPIES: { contenu: Contenu; libelle: string }[] = [
  { contenu: "profil", libelle: "Profil uniquement" },
  { contenu: "conversation", libelle: "Conversation uniquement" },
  { contenu: "tout", libelle: "Profil et conversation" },
];

const ELEMENT =
  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left body-6 text-encre outline-none transition-colors duration-150 hover:bg-creux focus-visible:bg-creux disabled:opacity-50";

export function MenuConversation({
  id,
  nonLu,
  nom,
  horsCrm,
  masquee,
  variante,
  className,
}: {
  id: string;
  nonLu: boolean;
  nom: string;
  /** Personne hors CRM : « Ajouter au CRM » proposé. */
  horsCrm: boolean;
  /** Personne masquée : « Réafficher » au lieu de « Ne plus afficher ». */
  masquee: boolean;
  /** « ligne » : dans la liste (second menu vers la droite) ; « entete » : conversation ouverte. */
  variante: "ligne" | "entete";
  /** Classes du conteneur (position comprise) ; « relative » par défaut. */
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [copier, setCopier] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const router = useRouter();
  const params = useSearchParams();
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const premier = useRef<HTMLButtonElement>(null);
  const panneau = useDansEcran<HTMLDivElement>(ouvert);
  const sousMenu = useDansEcran<HTMLDivElement>(ouvert && copier);
  const menuId = useId();

  // Panneau en position fixe, rendu hors de la liste (qui défile et rogne ce qui dépasse), calé
  // sous le bouton, aligné à droite.
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const ouvrir = () => {
    const r = bouton.current?.getBoundingClientRect();
    if (!r) return;
    setPosition({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOuvert(true);
  };

  const fermer = (rendreFocus = true) => {
    setOuvert(false);
    setCopier(false);
    setConfirmer(false);
    if (rendreFocus) bouton.current?.focus();
  };
  const interlocuteur = useActionsInterlocuteur(id, masquee, () => fermer(false));

  useEffect(() => {
    if (ouvert) premier.current?.focus();
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!racine.current?.contains(cible) && !panneau.current?.contains(cible)) fermer(false);
    };
    // La page ou la liste défile : le panneau, fixe, ne suivrait plus son bouton.
    const defilement = (e: Event) => {
      if (!panneau.current?.contains(e.target as Node)) fermer(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (copier) setCopier(false);
      else fermer();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", defilement, true);
    window.addEventListener("resize", defilement);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
      window.removeEventListener("scroll", defilement, true);
      window.removeEventListener("resize", defilement);
    };
  }, [ouvert, copier]); // eslint-disable-line react-hooks/exhaustive-deps -- fermer ne lit que des états et des refs

  const basculerLu = () =>
    demarrer(async () => {
      retourner(nonLu ? await actionMarquerLue(id) : await actionMarquerNonLue(id));
      fermer();
    });

  /**
   * Copie dans le geste de l'utilisateur : le texte est demandé au serveur et remis au
   * presse-papiers par une promesse (ClipboardItem), seul moyen accepté par Safari après un appel
   * réseau ; à défaut, écriture du texte une fois reçu.
   */
  const copierTexte = (contenu: Contenu) => {
    const texte = actionTexteCopie({ conversationId: id, contenu }).then((r) => {
      if (!r.ok) throw new Error(r.message);
      return r.texte;
    });
    const ecrire =
      typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "text/plain": texte.then((t) => new Blob([t], { type: "text/plain" })) })])
        : texte.then((t) => navigator.clipboard.writeText(t));
    ecrire.then(
      () => retourner({ ok: true, message: "Copié dans le presse-papiers." }),
      (e: unknown) => retourner({ ok: false, message: e instanceof Error && e.message.endsWith(".") ? e.message : "Copie impossible sur cet appareil." }),
    );
    fermer();
  };

  const supprimer = () =>
    demarrer(async () => {
      const r = await actionSupprimerConversation(id);
      retourner(r);
      fermer(false);
      if (r.ok && (variante === "entete" || params.get("conversation") === id)) router.replace("/inbox", { scroll: false });
    });

  return (
    <div ref={racine} className={className || "relative"} data-ouvert={ouvert || undefined}>
      <button
        ref={bouton}
        type="button"
        onClick={() => (ouvert ? fermer() : ouvrir())}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? menuId : undefined}
        aria-label={`Actions : conversation avec ${nom}`}
        title="Actions"
        className={`grid place-items-center rounded-full text-encre-2 outline-none transition-colors duration-150 hover:text-encre focus-visible:ring-2 focus-visible:ring-accent aria-expanded:text-encre ${
          variante === "ligne"
            ? "size-8 bg-carte shadow-[0_0_0_1px_var(--color-trait),0_1px_3px_rgba(0,0,0,0.06)] hover:bg-creux"
            : "size-9 hover:bg-creux aria-expanded:bg-creux"
        }`}
      >
        <IconeOptions taille={18} />
      </button>

      {ouvert && position && createPortal(
        <div
          ref={panneau}
          style={{ top: position.top, right: position.right }}
          id={menuId}
          role={confirmer ? "alertdialog" : "menu"}
          aria-label={confirmer ? "Confirmer la suppression" : `Actions : conversation avec ${nom}`}
          className="flottant dans-ecran fixed z-50 flex w-[min(248px,calc(100vw-32px))] animate-apparition flex-col overflow-visible rounded-[16px] p-1.5"
        >
          {confirmer ? (
            <div className="flex flex-col gap-3 p-2.5">
              <p className="body-6 text-encre">Supprimer la conversation avec {nom} ?</p>
              <p className="caption-5 text-encre-3">
                Elle disparaît de l&apos;outil avec ses messages, rien n&apos;est supprimé sur LinkedIn. La fiche prospect est conservée. Un
                nouveau message la fera réapparaître
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmer(false)} className="bouton bouton-discret px-3 py-1.5 caption-3">
                  Annuler
                </button>
                <button type="button" disabled={enCours} onClick={supprimer} className="bouton bouton-plein px-3 py-1.5 caption-3">
                  {enCours ? "Suppression…" : "Supprimer"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Element refBouton={premier} icone={<IconeEnveloppeOuverte taille={16} />} disabled={enCours} onClick={basculerLu}>
                {nonLu ? "Marquer comme lue" : "Marquer comme non lue"}
              </Element>
              <div className="relative">
                <Element icone={<IconeCopier taille={16} />} onClick={() => setCopier((v) => !v)} sousMenu={copier}>
                  Copier
                </Element>
                {copier && (
                  <div
                    ref={sousMenu}
                    role="menu"
                    aria-label="Copier"
                    className={`flottant dans-ecran absolute top-0 z-40 flex w-[min(220px,calc(100vw-32px))] animate-apparition flex-col rounded-[16px] p-1.5 ${
                      variante === "ligne" ? "left-[calc(100%+12px)]" : "right-[calc(100%+12px)]"
                    }`}
                  >
                    {COPIES.map((c) => (
                      <button key={c.contenu} type="button" role="menuitem" onClick={() => copierTexte(c.contenu)} className={ELEMENT}>
                        {c.libelle}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {horsCrm && (
                <Element icone={<IconeAjouterPersonne taille={16} />} disabled={enCours || interlocuteur.enCours} onClick={interlocuteur.ajouterAuCrm}>
                  Ajouter au CRM
                </Element>
              )}
              <Element icone={masquee ? <IconeAfficher taille={16} /> : <IconeMasquer taille={16} />} disabled={enCours || interlocuteur.enCours} onClick={() => interlocuteur.basculerMasquee(variante === "entete")}>
                {masquee ? "Réafficher" : "Ne plus afficher"}
              </Element>
              <Element icone={<IconeCorbeille taille={16} />} onClick={() => setConfirmer(true)} danger>
                Supprimer
              </Element>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Element({
  icone,
  onClick,
  children,
  disabled,
  danger,
  sousMenu,
  refBouton,
}: {
  icone: ReactNode;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  /** Ouvre un second menu : état ouvert annoncé, chevron. */
  sousMenu?: boolean;
  refBouton?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={refBouton}
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={sousMenu !== undefined ? "menu" : undefined}
      aria-expanded={sousMenu}
      className={`${ELEMENT} ${danger ? "text-rouge hover:bg-accent-doux focus-visible:bg-accent-doux" : ""} ${sousMenu ? "bg-creux" : ""}`}
    >
      <span className={danger ? "text-rouge" : "text-encre-2"} aria-hidden>
        {icone}
      </span>
      <span className="flex-1">{children}</span>
      {sousMenu !== undefined && (
        <svg viewBox="0 0 256 256" className="size-3.5 text-encre-3" fill="currentColor" aria-hidden>
          <path d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z" />
        </svg>
      )}
    </button>
  );
}
