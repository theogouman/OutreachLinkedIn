"use client";

import { useTransition } from "react";
import { actionArret } from "@/app/actions";
import { useRetour } from "./interface/toasts";
import { IconePlay, IconeStop } from "./icones";

/**
 * Arrêt d'urgence : un clic, effet immédiat côté serveur, sans animation ni maintien
 * avant l'action (inventaire design, besoin 6). Confirmation après coup par notification.
 */
export function BoutonArret({ arret }: { arret: boolean }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  return (
    <button
      type="button"
      disabled={enCours}
      onClick={() => demarrer(async () => retourner(await actionArret(!arret)))}
      className={`bouton ${arret ? "bouton-plein" : "bouton-contour text-accent"}`}
    >
      {arret ? <IconePlay taille={18} /> : <IconeStop taille={18} />}
      {arret ? "Reprendre la file" : "Arrêt d'urgence"}
    </button>
  );
}
