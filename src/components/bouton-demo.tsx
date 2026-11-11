"use client";

import { useTransition } from "react";
import { actionChargerDemo } from "@/app/actions";
import { useRetour } from "./interface/toasts";

export function BoutonDemo() {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  return (
    <button
      type="button"
      disabled={enCours}
      onClick={() => demarrer(async () => retourner(await actionChargerDemo()))}
      className="bouton bouton-plein"
    >
      {enCours ? "Chargement…" : "Charger les données de démo"}
    </button>
  );
}
