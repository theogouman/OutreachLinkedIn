"use client";

/*
 * Actions sur l'interlocuteur d'une conversation, partagées par le menu « ⋯ » et la carte
 * d'infos (hors CRM) : ajouter au CRM (la fiche créée s'ouvre par-dessus la conversation) et ne
 * plus afficher / réafficher (conversation ouverte masquée : retour à l'Inbox).
 */

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { actionAjouterAuCrm, actionMasquerConversation, actionReafficherConversation } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";

export function useActionsInterlocuteur(id: string, masquee: boolean, apres?: () => void) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const router = useRouter();
  const params = useSearchParams();

  const ajouterAuCrm = () =>
    demarrer(async () => {
      const r = await actionAjouterAuCrm(id);
      retourner(r);
      apres?.();
      if (r.ok && r.prospectId) router.push(`/inbox?${new URLSearchParams({ conversation: id, prospect: r.prospectId })}`, { scroll: false });
    });

  /** `ouverte` : la conversation est affichée (en-tête, carte) ; masquée, on revient à l'Inbox. */
  const basculerMasquee = (ouverte: boolean) =>
    demarrer(async () => {
      const r = masquee ? await actionReafficherConversation(id) : await actionMasquerConversation(id);
      retourner(r);
      apres?.();
      if (r.ok && !masquee && (ouverte || params.get("conversation") === id)) router.replace("/inbox", { scroll: false });
    });

  return { enCours, ajouterAuCrm, basculerMasquee };
}
