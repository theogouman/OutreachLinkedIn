"use client";

import { useTransition } from "react";
import { actionChargerDemo, actionPurgerDemo } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { IconeDemo } from "@/components/icones";
import { Section } from "./formulaires";

export function PanneauDemo({ modeSimule, prospectsDemo }: { modeSimule: boolean; prospectsDemo: number }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();

  return (
    <Section
      icone={<IconeDemo taille={18} />}
      titre="Données de démonstration"
      description="Prospects, entreprises et conversations fictifs avec trois semaines d'historique, pour essayer l'outil sans Unipile"
      pied={
        <>
          <button
            type="button"
            disabled={enCours || prospectsDemo === 0}
            className="bouton bouton-discret"
            onClick={() => {
              if (window.confirm("Supprimer tous les prospects fictifs, leur historique et leurs tâches ?")) {
                demarrer(async () => retourner(await actionPurgerDemo()));
              }
            }}
          >
            Supprimer
          </button>
          <button
            type="button"
            disabled={enCours || !modeSimule || prospectsDemo > 0}
            className="bouton bouton-plein"
            onClick={() => demarrer(async () => retourner(await actionChargerDemo()))}
          >
            {enCours ? "Patiente…" : "Charger les données"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 title-4 text-encre">
          <span className={`size-2 rounded-full ${prospectsDemo > 0 ? "bg-emerald-500" : "bg-trait-fort"}`} aria-hidden />
          {prospectsDemo > 0 ? `${prospectsDemo} prospects fictifs chargés` : "Aucune donnée de démonstration"}
        </p>
        <p className="body-6 text-encre-3">
          Tant qu&apos;Unipile n&apos;est pas branché, seules ces données sont traitées par la file : un vrai prospect importé attend le
          branchement et ne reçoit jamais de faux identifiant. À supprimer avant le passage en réel.
        </p>
        {!modeSimule && <p className="caption-5 text-encre-3">Unipile est branché : le chargement est désactivé.</p>}
      </div>
    </Section>
  );
}
