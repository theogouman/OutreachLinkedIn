"use client";

/*
 * « Nouveau message » depuis l'Inbox : choisir un prospect, puis écrire dans sa fiche (onglet
 * Conversation). Seules les relations de 1er degré sont proposées : LinkedIn bloquerait un
 * message normal à toute autre personne (pas d'InMail). Recherche sur le moteur des prospects.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modale, useModale } from "@/components/interface/modale";
import { Avatar } from "@/components/interface/elements";
import { IconeFermer, IconeRecherche } from "@/components/icones";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";
import { actionListerProspects } from "@/app/actions";
import type { LigneProspect } from "@/server/donnees";

export function BoutonNouveauMessage() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="bouton bouton-plein">
        Nouveau message
      </button>
      {ouvert && <ChoixDestinataire fermer={() => setOuvert(false)} />}
    </>
  );
}

function ChoixDestinataire({ fermer }: { fermer: () => void }) {
  return (
    <Modale fermer={fermer} largeur={520} enTete={<EnTete />}>
      <Recherche />
    </Modale>
  );
}

function EnTete() {
  const { fermer, titreId } = useModale();
  return (
    <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
      <div>
        <h2 id={titreId} className="title-2 text-encre">
          Nouveau message
        </h2>
        <p className="mt-1 caption-5 text-encre-3">Seules tes relations de 1er degré apparaissent : LinkedIn bloquerait un message aux autres</p>
      </div>
      <button
        type="button"
        onClick={fermer}
        aria-label="Fermer"
        className="grid size-9 shrink-0 place-items-center rounded-full text-encre-3 outline-none hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
      >
        <IconeFermer taille={16} />
      </button>
    </header>
  );
}

function Recherche() {
  const router = useRouter();
  const { fermer } = useModale();
  const [texte, setTexte] = useState("");
  const [lignes, setLignes] = useState<LigneProspect[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const demande = useRef(0);

  useEffect(() => {
    const n = ++demande.current;
    const id = window.setTimeout(
      async () => {
        const r = await actionListerProspects({ recherche: texte.trim() || undefined, statut: "en_relation", page: 1 });
        if (n !== demande.current) return; // réponse périmée
        if (r.ok) {
          setLignes(r.lignes.slice(0, 30));
          setErreur(null);
        } else setErreur(r.message);
      },
      texte ? 200 : 0,
    );
    return () => window.clearTimeout(id);
  }, [texte]);

  const choisir = (p: LigneProspect) => {
    fermer();
    router.push(`/inbox?${new URLSearchParams({ prospect: p.id, onglet: "conversation" })}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 px-6 pb-6">
      <label className="relative">
        <span className="sr-only">Rechercher une relation</span>
        <IconeRecherche taille={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-3" />
        <input
          type="search"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          className="champ pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <TexteSaisieAnime valeur={texte} placeholder="Nom, poste ou entreprise" />
      </label>
      {erreur && (
        <p role="alert" className="rounded-xl bg-accent-doux px-3 py-2 caption-5 text-rouge">
          {erreur}
        </p>
      )}
      <ul className="flex max-h-[50dvh] flex-col overflow-y-auto" aria-live="polite" aria-busy={lignes === null}>
        {lignes?.length === 0 && <li className="px-2 py-6 text-center caption-5 text-encre-3">Aucune relation de 1er degré ne correspond</li>}
        {lignes?.map((p) => {
          const nom = [p.prenom, p.nom].filter(Boolean).join(" ") || "Prospect";
          const sous = [p.poste, p.entreprise].filter(Boolean).join(" · ");
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choisir(p)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-creux focus-visible:bg-creux"
              >
                <Avatar nom={nom} taille={32} photo={p.photo} />
                <span className="min-w-0">
                  <span className="block truncate body-6 text-encre">{nom}</span>
                  {sous && <span className="block truncate caption-5 text-encre-3">{sous}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
