import { Suspense } from "react";
import { etatOutil, reglages } from "@/server/donnees";
import { PanneauDemo } from "./demo";
import { FormPlafonds, FormReglages } from "./formulaires";

export default function PageReglages() {
  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <Contenu />
      </Suspense>
    </section>
  );
}

async function Contenu() {
  const [r, etat] = await Promise.all([reglages(), etatOutil()]);
  return (
    <>
      <FormPlafonds initial={r.plafonds} />
      <FormReglages initial={{ plages: r.plages, delaiMinS: r.delaiMinS, delaiMaxS: r.delaiMaxS, cadence: r.cadence }} />
      <PanneauDemo modeSimule={etat.modeSimule} prospectsDemo={etat.prospectsDemo} />
    </>
  );
}
