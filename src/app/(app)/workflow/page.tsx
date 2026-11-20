import { Suspense } from "react";
import { automatisations } from "@/server/donnees";
import { EnTetePage } from "@/components/interface/elements";
import { ListeAutomatisations } from "./automatisation";

/**
 * Page Workflow (spec 001-workflows) : les automatisations régulières qui alimentent la file
 * d'attente. Une automatisation = un encadré extensible (même mécanique que Réglages).
 */
export default function PageWorkflow() {
  return (
    <section className="flex max-w-[960px] flex-col gap-6">
      <EnTetePage titre="Workflow" description="Des automatisations régulières qui alimentent la file d'attente, sous les mêmes quotas que tes actions" />
      <Suspense fallback={<SqueletteWorkflow />}>
        <Contenu />
      </Suspense>
    </section>
  );
}

function SqueletteWorkflow() {
  return (
    <div className="carte flex items-center gap-3 px-5 py-4 sm:px-6 sm:py-5" aria-busy="true" aria-label="Chargement">
      <span className="squelette size-9 rounded-xl" />
      <span className="flex flex-1 flex-col gap-2">
        <span className="squelette h-4 w-56" />
        <span className="squelette h-3 w-72 max-w-full" />
      </span>
    </div>
  );
}

async function Contenu() {
  return <ListeAutomatisations automatisations={await automatisations()} />;
}
