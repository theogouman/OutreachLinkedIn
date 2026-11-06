"use client";

import { useState, useTransition } from "react";
import { actionArret, type Retour } from "@/app/actions";
import { Notification } from "./notification";

/** Bouton d'arrêt d'urgence : coupe immédiatement toutes les actions sortantes. */
export function BoutonArret({ arret }: { arret: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<Retour | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={enCours}
        onClick={() => demarrer(async () => setRetour(await actionArret(!arret)))}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          arret ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-[#b5443d] text-white hover:bg-[#9c3a34]"
        }`}
      >
        {arret ? "Reprendre la file" : "Arrêt d'urgence"}
      </button>
      <Notification retour={retour} />
    </>
  );
}
