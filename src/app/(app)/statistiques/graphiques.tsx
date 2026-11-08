"use client";

import { useMemo } from "react";
import { FunnelChart } from "@/components/charts/funnel-chart";
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  type HeatmapColumn,
} from "@/components/charts/heatmap";
import { Chiffre } from "@/components/interface/elements";
import type { EtapeEntonnoir, JourActivite } from "@/server/donnees";

const JOUR_MS = 86_400_000;
const nombre = new Intl.NumberFormat("fr-FR");
const pourcent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/** Semaines du dimanche au samedi (format attendu par le graphique), affichées à partir du lundi. */
function colonnes(debut: string, fin: string, jours: JourActivite[]): HeatmapColumn[] {
  const parJour = new Map(jours.map((j) => [j.jour, j.total]));
  const d0 = new Date(`${debut}T12:00:00Z`);
  const dimanche = new Date(d0.getTime() - d0.getUTCDay() * JOUR_MS);
  const derniere = new Date(`${fin}T12:00:00Z`).getTime();
  const sortie: HeatmapColumn[] = [];
  for (let s = 0, t = dimanche.getTime(); t <= derniere; s++, t += 7 * JOUR_MS) {
    sortie.push({
      bin: s,
      bins: Array.from({ length: 7 }, (_, i) => {
        const date = new Date(t + i * JOUR_MS);
        const cle = date.toISOString().slice(0, 10);
        return { bin: i, count: parJour.get(cle) ?? 0, date: new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) };
      }),
    });
  }
  return sortie;
}

export function Graphiques({
  entonnoir,
  activite,
}: {
  entonnoir: { etapes: EtapeEntonnoir[]; sorties: EtapeEntonnoir[] };
  activite: { debut: string; fin: string; jours: JourActivite[]; joursActifs: number };
}) {
  const donneesEntonnoir = entonnoir.etapes.map((e) => ({ label: e.libelle, value: e.valeur }));
  const total = entonnoir.etapes[0]?.valeur ?? 0;
  const gagnes = entonnoir.etapes.at(-1)?.valeur ?? 0;
  const donneesActivite = useMemo(() => colonnes(activite.debut, activite.fin, activite.jours), [activite]);
  const somme = (cle: "total" | "invitations" | "messages" | "lectures") => activite.jours.reduce((n, j) => n + j[cle], 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="carte flex flex-col gap-5 p-6" aria-labelledby="titre-entonnoir">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titre-entonnoir" className="title-2 text-encre">Entonnoir par étape</h2>
            <p className="mt-0.5 body-6 text-encre-3">Prospects ayant atteint chaque étape, du premier contact au gain.</p>
          </div>
          {total > 0 && (
            <p className="caption-4 text-encre-2">
              Conversion globale <span className="title-4 text-encre">{pourcent.format(gagnes / total)}</span>
            </p>
          )}
        </div>
        {total === 0 ? (
          <p className="py-10 text-center body-6 text-encre-3">Aucun prospect pour l&apos;instant.</p>
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto px-2">
              <div className="min-w-[720px]">
                <FunnelChart
                  data={donneesEntonnoir}
                  style={{ aspectRatio: "3.2 / 1" }}
                  formatValue={(v) => nombre.format(v)}
                  formatPercentage={(p) => `${Math.round(p)} %`}
                />
              </div>
            </div>
            {entonnoir.sorties.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Sorties de l'entonnoir">
                {entonnoir.sorties.map((s) => (
                  <li key={s.code} className="rounded-full bg-creux px-3 py-1 caption-4 text-encre-2 ring-1 ring-inset ring-trait">
                    {s.libelle} <span className="tabular-nums text-encre">{nombre.format(s.valeur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="carte flex flex-col gap-5 p-6" aria-labelledby="titre-activite">
        <div>
          <h2 id="titre-activite" className="title-2 text-encre">Activité de prospection</h2>
          <p className="mt-0.5 body-6 text-encre-3">Invitations, messages et lectures de profil réussis, jour par jour, sur six mois.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-trait ring-1 ring-trait sm:grid-cols-4">
          {[
            { t: "Jours actifs", v: activite.joursActifs },
            { t: "Invitations", v: somme("invitations") },
            { t: "Messages", v: somme("messages") },
            { t: "Lectures de profil", v: somme("lectures") },
          ].map((x) => (
            <div key={x.t} className="flex flex-col gap-1 bg-carte px-4 py-3">
              <dt className="caption-4 text-encre-3">{x.t}</dt>
              <dd className="text-2xl font-semibold tracking-[-0.02em] text-encre">
                <Chiffre valeur={x.v} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="-mx-2 overflow-x-auto px-2">
          <div className="min-w-[640px]">
            <HeatmapInteractionProvider>
              <HeatmapInteractionBoundary>
                <div className="flex w-full flex-col items-stretch gap-3">
                  <HeatmapChart className="w-full" data={donneesActivite} layout="fluid" weekStartDay={1}>
                    <HeatmapCells />
                    <HeatmapXAxis />
                    <HeatmapYAxis />
                    <HeatmapTooltip />
                  </HeatmapChart>
                  <HeatmapLegend />
                </div>
              </HeatmapInteractionBoundary>
            </HeatmapInteractionProvider>
          </div>
        </div>
        {somme("total") === 0 && <p className="text-center caption-5 text-encre-3">Aucune action LinkedIn sur la période.</p>}
      </section>
    </div>
  );
}
