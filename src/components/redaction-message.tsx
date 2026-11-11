"use client";

/*
 * Rédaction d'un message LinkedIn : composant UNIQUE, utilisé par l'Inbox et par la fiche
 * prospect. Un seul chemin d'envoi : l'action serveur met le message dans la file d'attente,
 * qui l'envoie sous les quotas, dans les plages horaires et après le délai entre actions.
 * Cible : une conversation existante, ou un prospect (premier message, relation de 1er degré).
 */

import { useId, useRef, useState, useTransition } from "react";
import { actionEnvoyerMessage } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { IconeEnvoyer } from "@/components/icones";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";

const MAX = 8000;

export function RedactionMessage({
  cible,
  destinataire,
  restants,
  bloque,
}: {
  cible: { conversationId: string } | { prospectId: string };
  /** Prénom ou nom, pour le libellé du champ. */
  destinataire: string;
  /** Messages encore possibles aujourd'hui (quota du jour). */
  restants: number;
  /** Raison d'un envoi impossible (affichée à la place du champ actif). */
  bloque?: string;
}) {
  const [texte, setTexte] = useState("");
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const aideId = useId();
  const champ = useRef<HTMLTextAreaElement>(null);
  // Identifiant de rédaction : un double envoi du même texte ne crée qu'une tâche.
  const cle = useRef<string | null>(null);

  const vide = texte.trim().length === 0;
  const desactive = !!bloque || enCours;

  const ajuster = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const envoyer = () => {
    if (vide || desactive) return;
    cle.current ??= crypto.randomUUID();
    const entree = { ...cible, texte, cle: cle.current };
    demarrer(async () => {
      const r = await actionEnvoyerMessage(entree);
      retourner(r);
      if (r.ok) {
        setTexte("");
        cle.current = null;
        if (champ.current) {
          champ.current.style.height = "auto";
          champ.current.focus();
        }
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
      className="flex flex-col gap-2"
    >
      <div className="relative flex items-end gap-2 rounded-2xl bg-carte p-2 ring-1 ring-trait transition-shadow duration-150 focus-within:ring-accent/60">
        <textarea
          ref={champ}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            cle.current = null; // texte modifié : nouvelle rédaction
            ajuster(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              envoyer();
            }
          }}
          rows={1}
          maxLength={MAX}
          disabled={!!bloque}
          aria-label={`Message à ${destinataire}`}
          aria-describedby={aideId}
          className="selectionnable min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 body-6 text-encre outline-none placeholder:text-encre-3 disabled:cursor-not-allowed"
        />
        <TexteSaisieAnime valeur={texte} placeholder={bloque ? "Envoi indisponible" : `Écrire à ${destinataire}`} />
        <button type="submit" disabled={vide || desactive} className="bouton bouton-plein size-9 shrink-0 p-0" aria-label="Mettre le message en file">
          {enCours ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
          ) : (
            <IconeEnvoyer taille={16} />
          )}
        </button>
      </div>
      <p id={aideId} className="flex flex-wrap justify-between gap-x-3 px-1 caption-5 text-encre-3">
        {bloque ? (
          <span>{bloque}</span>
        ) : (
          <>
            <span>
              Part par la file d&apos;attente, sous quota · {restants} restant{restants > 1 ? "s" : ""} aujourd&apos;hui
            </span>
            <span className="tabular-nums">{texte.length > MAX - 1000 ? `${texte.length} / ${MAX}` : "⌘ ou Ctrl + Entrée pour envoyer"}</span>
          </>
        )}
      </p>
    </form>
  );
}
