"use client";

/*
 * Carte d'infos d'un interlocuteur hors CRM (ouverte depuis l'en-tête de la conversation, ?interlocuteur=1) :
 * identité lue chez Unipile (nom, poste, photo, profil LinkedIn). Actions : ouvrir son LinkedIn
 * (première ligne), puis « Ajouter au CRM » et « Ne plus afficher » / « Réafficher » sur deux
 * colonnes, mêmes actions que le menu « ⋯ » (`useActionsInterlocuteur`).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modale, useModale } from "@/components/interface/modale";
import { Avatar } from "@/components/interface/elements";
import { IconeAfficher, IconeAjouterPersonne, IconeFermer, IconeMasquer } from "@/components/icones";
import { useActionsInterlocuteur } from "./actions-interlocuteur";
import { LogoLinkedIn } from "@/components/logos";

export function CarteInterlocuteur({
  conversationId,
  masquee,
  nom,
  titre,
  photo,
  lienLinkedIn,
  identifie,
}: {
  conversationId: string;
  masquee: boolean;
  nom: string;
  titre: string | null;
  photo: string | null;
  lienLinkedIn: string | null;
  identifie: boolean;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const fermer = () => {
    const q = new URLSearchParams(params);
    q.delete("interlocuteur");
    router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
  };
  const { enCours, ajouterAuCrm, basculerMasquee } = useActionsInterlocuteur(conversationId, masquee);
  return (
    <Modale fermer={fermer} largeur={460} enTete={<EnTete nom={nom} photo={photo} />}>
      <div className="flex flex-col gap-4 px-6 pb-6 sm:px-8 sm:pb-8">
        {titre && <p className="body-6 text-encre-2">{titre}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 dark:bg-amber-400/15 px-2.5 py-1 caption-4 text-amber-800 dark:text-amber-300">Hors CRM</span>
          {!identifie && <span className="caption-5 text-encre-3">Profil en cours d&apos;identification</span>}
        </div>
        <div className="flex flex-col gap-2">
          {lienLinkedIn && (
            <a href={lienLinkedIn} target="_blank" rel="noopener noreferrer" className="bouton bouton-contour w-full justify-center">
              <LogoLinkedIn taille={18} />
              Ouvrir son LinkedIn
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={enCours || !identifie} onClick={ajouterAuCrm} className="bouton bouton-contour justify-center disabled:opacity-50">
              <IconeAjouterPersonne taille={18} />
              Ajouter au CRM
            </button>
            <button type="button" disabled={enCours} onClick={() => basculerMasquee(true)} className="bouton bouton-contour justify-center disabled:opacity-50">
              {masquee ? <IconeAfficher taille={18} /> : <IconeMasquer taille={18} />}
              {masquee ? "Réafficher" : "Ne plus afficher"}
            </button>
          </div>
        </div>
        <p className="caption-5 text-encre-3">Cette personne n&apos;est pas encore dans tes prospects</p>
      </div>
    </Modale>
  );
}

function EnTete({ nom, photo }: { nom: string; photo: string | null }) {
  const { fermer, titreId } = useModale();
  return (
    <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-6 sm:px-8 sm:pt-7">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar nom={nom} taille={56} photo={photo} />
        <h2 id={titreId} className="min-w-0 text-[24px] font-medium leading-tight tracking-[-0.02em] text-encre">
          {nom}
        </h2>
      </div>
      <button
        type="button"
        onClick={fermer}
        aria-label="Fermer la carte"
        className="grid size-9 shrink-0 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
      >
        <IconeFermer taille={16} />
      </button>
    </header>
  );
}
