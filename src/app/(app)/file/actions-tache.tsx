"use client";

import { useTransition } from "react";
import { actionAnnulerTache, actionTrancher } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";

export function ActionsTache({ id, statut }: { id: string; statut: string }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const bouton = "rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-50";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {statut === "en_attente" && (
        <button
          type="button"
          disabled={enCours}
          className={`${bouton} text-neutral-700 ring-neutral-300 hover:bg-neutral-50`}
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
            className={`${bouton} text-emerald-700 ring-emerald-300 hover:bg-emerald-50`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "faite")))}
          >
            C&apos;est parti
          </button>
          <button
            type="button"
            disabled={enCours}
            title="L'action n'est pas partie : la renvoyer (risque de doublon si elle était partie)"
            className={`${bouton} text-amber-700 ring-amber-300 hover:bg-amber-50`}
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
            className={`${bouton} text-neutral-700 ring-neutral-300 hover:bg-neutral-50`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "abandonner")))}
          >
            Abandonner
          </button>
        </>
      )}
    </div>
  );
}
