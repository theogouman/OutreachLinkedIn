"use client";

/*
 * Notes de la fiche, modifiables sur place : enregistrement automatique 800 ms après la dernière
 * frappe et à la sortie du champ (validation côté serveur, 4 000 caractères au plus).
 */

import { useEffect, useRef, useState } from "react";
import { actionModifierNotes } from "@/app/actions";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";

const MAX = 4000;
type Etat = "repos" | "modifie" | "enregistrement" | "enregistre" | "erreur";

export function NotesProspect({ prospectId, initiales }: { prospectId: string; initiales: string | null }) {
  const [texte, setTexte] = useState(initiales ?? "");
  const [etat, setEtat] = useState<Etat>("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistre = useRef(initiales ?? "");
  const minuteur = useRef<number | undefined>(undefined);
  const champ = useRef<HTMLTextAreaElement>(null);

  const ajuster = () => {
    const el = champ.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  };
  useEffect(ajuster, []);

  const enregistrer = async (valeur: string) => {
    window.clearTimeout(minuteur.current);
    if (valeur === enregistre.current) return;
    setEtat("enregistrement");
    const r = await actionModifierNotes({ prospectId, notes: valeur });
    if (r.ok) {
      enregistre.current = valeur;
      setEtat("enregistre");
      setErreur(null);
    } else {
      setEtat("erreur");
      setErreur(r.message);
    }
  };

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const libelles: Record<Etat, string> = {
    repos: "",
    modifie: "Modifications non enregistrées",
    enregistrement: "Enregistrement…",
    enregistre: "Enregistré",
    erreur: erreur ?? "Enregistrement impossible",
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Notes">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`notes-${prospectId}`} className="caption-4 text-encre-3">
          Notes
        </label>
        <span role="status" className={`caption-5 ${etat === "erreur" ? "text-rouge" : "text-encre-3"}`}>
          {libelles[etat]}
        </span>
      </div>
      <div className="relative">
        <textarea
          id={`notes-${prospectId}`}
          ref={champ}
          value={texte}
          maxLength={MAX}
          rows={3}
          onChange={(e) => {
            const v = e.target.value;
            setTexte(v);
            setEtat("modifie");
            ajuster();
            window.clearTimeout(minuteur.current);
            minuteur.current = window.setTimeout(() => void enregistrer(v), 800);
          }}
          onBlur={() => void enregistrer(texte)}
          className="selectionnable block w-full resize-none rounded-2xl bg-creux px-4 py-3 body-6 text-encre-2 outline-none ring-1 ring-inset ring-transparent transition-shadow duration-150 focus:bg-carte focus:text-encre focus:ring-accent/60"
        />
        <TexteSaisieAnime valeur={texte} placeholder="Ajouter une note sur ce prospect" />
      </div>
    </section>
  );
}
