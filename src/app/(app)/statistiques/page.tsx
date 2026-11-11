import { Suspense } from "react";
import { EnTetePage } from "@/components/interface/elements";
import { statistiques } from "@/server/donnees";
import { Graphiques } from "./graphiques";

export default function PageStatistiques() {
  return (
    <section className="flex flex-col gap-6">
      <EnTetePage titre="Statistiques" />
      <Suspense fallback={<Squelette />}>
        <Contenu />
      </Suspense>
    </section>
  );
}

function Squelette() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Chargement">
      <div className="carte flex flex-col gap-4 p-6">
        <span className="squelette h-4 w-48" />
        <span className="squelette h-56 w-full rounded-2xl" />
      </div>
      <div className="carte flex flex-col gap-4 p-6">
        <span className="squelette h-4 w-48" />
        <span className="squelette h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}

async function Contenu() {
  const { entonnoir, activite } = await statistiques();
  return <Graphiques entonnoir={entonnoir} activite={activite} />;
}
