"use client";

import { useTransition } from "react";
import { actionAnnulerTache, actionTrancher } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";

export function ActionsTache({ id, statut }: { id: string; statut: string }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const petit = "bouton px-2.5 py-1 caption-3";

  return (
    <div className="flex flex-wrap gap-2 sm:justify-end">
      {statut === "en_attente" && (
        <button
          type="button"
          disabled={enCours}
          className={`${petit} bouton-discret`}
          onClick={() => demarrer(async () => retourner(await actionAnnulerTache(id)))}
        >
          Annuler
        </button>
      )}
      {statut === "incertaine" && (
        <>
          <button
            type="button"
            disabled={enCours}
            title="L'action est bien partie (vérifié sur LinkedIn)"
            className={`${petit} bouton-plein`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "faite")))}
          >
            C&apos;est parti
          </button>
          <button
            type="button"
            disabled={enCours}
            title="L'action n'est pas partie : la renvoyer (risque de doublon si elle était partie)"
            className={`${petit} bouton-contour`}
            onClick={() => {
              if (window.confirm("Renvoyer cette action ? Si elle était déjà partie, le prospect la recevra deux fois.")) {
                demarrer(async () => retourner(await actionTrancher(id, "remettre")));
              }
            }}
          >
            Renvoyer
          </button>
          <button
            type="button"
            disabled={enCours}
            className={`${petit} bouton-discret`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "abandonner")))}
          >
            Abandonner
          </button>
        </>
      )}
    </div>
  );
}
