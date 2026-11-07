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
      className="rounded-lg bg-[#b5443d] px-4 py-2 text-sm font-medium text-white hover:bg-[#9c3a34] disabled:opacity-60"
    >
      {enCours ? "Chargement…" : "Charger les données de démo"}
    </button>
  );
}
