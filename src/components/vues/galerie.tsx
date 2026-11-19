"use client";

/*
 * Mise en page « Galerie » : une carte compacte par prospect (photo, nom, poste), puis les
 * propriétés choisies pour la vue. La carte entière ouvre la fiche ; les propriétés modifiables
 * passent au-dessus de cette zone et s'éditent sur place.
 */

import type { ReactNode } from "react";
import { Avatar } from "@/components/interface/elements";
import { PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";
import type { LigneProspect } from "@/server/donnees";
import { ValeurPropriete, type ContexteProprietes } from "./proprietes";

export function GalerieProspects({
  lignes,
  proprietes,
  ctx,
  ouvrir,
  vide,
}: {
  lignes: LigneProspect[];
  proprietes: ClePropriete[];
  ctx: ContexteProprietes;
  ouvrir: (id: string) => void;
  vide?: ReactNode;
}) {
  if (lignes.length === 0) return <div className="carte grid place-items-center px-6 py-12">{vide}</div>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Prospects">
      {lignes.map((p) => {
        const nom = [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom";
        return (
          <li key={p.id} className="carte group relative flex min-w-0 flex-col gap-3 p-4 transition-colors duration-150 hover:bg-creux/60">
            <button
              type="button"
              onClick={() => ouvrir(p.id)}
              aria-label={`Ouvrir la fiche de ${nom}`}
              className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <div className="flex min-w-0 items-center gap-3">
              <Avatar nom={nom} photo={p.photo} taille={40} />
              <div className="min-w-0">
                <p className="truncate title-4 text-encre">{nom}</p>
                <p className="truncate caption-5 text-encre-3">{p.poste ?? "Poste inconnu"}</p>
              </div>
            </div>
            {proprietes.length > 0 && (
              <dl className="grid grid-cols-[minmax(84px,auto)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-trait pt-3">
                {proprietes.map((cle) => {
                  const def = PROPRIETES_PROSPECTS[cle];
                  return (
                    <div key={cle} className="contents">
                      <dt className="truncate caption-4 text-encre-3">{def.libelle}</dt>
                      <dd className={`flex min-h-6 min-w-0 items-center body-6 ${def.modifiable ? "relative z-10" : "pointer-events-none"}`}>
                        <ValeurPropriete cle={cle} prospect={p} ctx={ctx} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
