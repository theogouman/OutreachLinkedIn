import { Suspense } from "react";
import { etatOutil, reglages } from "@/server/donnees";
import { EnTetePage } from "@/components/interface/elements";
import { PanneauDemo } from "./demo";
import { FormPlafonds, FormReglages } from "./formulaires";

export default function PageReglages() {
  return (
    <section className="flex max-w-[960px] flex-col gap-6">
      <EnTetePage titre="Réglages" description="Les limites que la file d'attente respecte, sans exception" />
      <Suspense fallback={<SqueletteReglages />}>
        <Contenu />
      </Suspense>
    </section>
  );
}

function SqueletteReglages() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Chargement">
      {[0, 1].map((i) => (
        <div key={i} className="carte flex flex-col gap-4 p-6">
          <span className="squelette h-4 w-48" />
          <span className="squelette h-3 w-80" />
          <span className="squelette h-24 w-full" />
        </div>
      ))}
    </div>
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
