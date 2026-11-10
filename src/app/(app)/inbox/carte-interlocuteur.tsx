"use client";

/*
 * Carte d'infos d'un interlocuteur hors CRM (ouverte depuis l'en-tête de la conversation, ?interlocuteur=1) :
 * identité lue chez Unipile (nom, poste, photo, profil LinkedIn), sans créer de prospect.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modale, useModale } from "@/components/interface/modale";
import { Avatar } from "@/components/interface/elements";
import { IconeFermer } from "@/components/icones";
import { LogoLinkedIn } from "@/components/logos";

export function CarteInterlocuteur({
  nom,
  titre,
  photo,
  lienLinkedIn,
  identifie,
}: {
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
  return (
    <Modale fermer={fermer} largeur={460} enTete={<EnTete nom={nom} photo={photo} />}>
      <div className="flex flex-col gap-4 px-6 pb-6 sm:px-8 sm:pb-8">
        {titre && <p className="body-6 text-encre-2">{titre}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-2.5 py-1 caption-4 text-amber-800">Hors CRM</span>
          {!identifie && <span className="caption-5 text-encre-3">Profil en cours d&apos;identification</span>}
        </div>
        {lienLinkedIn && (
          <a href={lienLinkedIn} target="_blank" rel="noopener noreferrer" className="bouton bouton-contour self-start">
            <LogoLinkedIn taille={18} />
            Ouvrir son LinkedIn
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        )}
        <p className="caption-5 text-encre-3">Cette personne n&apos;est pas dans tes prospects : rien n&apos;est ajouté au CRM</p>
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
