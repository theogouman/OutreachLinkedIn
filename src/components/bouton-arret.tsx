"use client";

import { useTransition } from "react";
import { actionArret } from "@/app/actions";
import { useRetour } from "./interface/toasts";

/** Bouton d'arrêt d'urgence : coupe immédiatement toutes les actions sortantes. */
export function BoutonArret({ arret }: { arret: boolean }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  return (
    <>
      <button
        type="button"
        disabled={enCours}
        onClick={() => demarrer(async () => retourner(await actionArret(!arret)))}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          arret ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-[#b5443d] text-white hover:bg-[#9c3a34]"
        }`}
      >
        {arret ? "Reprendre la file" : "Arrêt d'urgence"}
      </button>
    </>
  );
}
