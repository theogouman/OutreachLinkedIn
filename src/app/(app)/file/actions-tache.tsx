"use client";

import { useState, useTransition } from "react";
import { actionAnnulerTache, actionTrancher, type Retour } from "@/app/actions";
import { Notification } from "@/components/notification";

export function ActionsTache({ id, statut }: { id: string; statut: string }) {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<Retour | null>(null);
  const bouton = "rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-50";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {statut === "en_attente" && (
        <button
          type="button"
          disabled={enCours}
          className={`${bouton} text-neutral-700 ring-neutral-300 hover:bg-neutral-50`}
          onClick={() => demarrer(async () => setRetour(await actionAnnulerTache(id)))}
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
            onClick={() => demarrer(async () => setRetour(await actionTrancher(id, "faite")))}
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
                demarrer(async () => setRetour(await actionTrancher(id, "remettre")));
              }
            }}
          >
            Renvoyer
          </button>
          <button
            type="button"
            disabled={enCours}
            className={`${bouton} text-neutral-700 ring-neutral-300 hover:bg-neutral-50`}
            onClick={() => demarrer(async () => setRetour(await actionTrancher(id, "abandonner")))}
          >
            Abandonner
          </button>
        </>
      )}
      <Notification retour={retour} />
    </div>
  );
}
