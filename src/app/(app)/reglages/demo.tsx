"use client";

import { useTransition } from "react";
import { actionChargerDemo, actionPurgerDemo } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";

export function PanneauDemo({ modeSimule, prospectsDemo }: { modeSimule: boolean; prospectsDemo: number }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const bouton = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-semibold">Données de démonstration</h2>
        <p className="text-sm text-neutral-600">
          Prospects et entreprises fictifs, avec trois semaines d&apos;historique, pour essayer l&apos;outil sans Unipile.
          Tant qu&apos;Unipile n&apos;est pas branché, seules ces données sont traitées par la file : un vrai prospect importé
          attend le branchement et ne reçoit jamais de faux identifiant. À supprimer avant le passage en réel.
        </p>
        <p className="mt-2 text-sm text-neutral-800">
          {prospectsDemo > 0 ? `${prospectsDemo} prospects fictifs chargés.` : "Aucune donnée de démonstration."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={enCours || !modeSimule || prospectsDemo > 0}
          className={`${bouton} bg-[#b5443d] text-white hover:bg-[#9c3a34]`}
          onClick={() => demarrer(async () => retourner(await actionChargerDemo()))}
        >
          Charger les données de démo
        </button>
        <button
          type="button"
          disabled={enCours || prospectsDemo === 0}
          className={`${bouton} text-neutral-700 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50`}
          onClick={() => {
            if (window.confirm("Supprimer tous les prospects fictifs, leur historique et leurs tâches ?")) {
              demarrer(async () => retourner(await actionPurgerDemo()));
            }
          }}
        >
          Supprimer les données de démo
        </button>
      </div>
      {!modeSimule && <p className="text-xs text-neutral-500">Unipile est branché : le chargement est désactivé.</p>}
    </section>
  );
}
