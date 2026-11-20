import { Suspense } from "react";
import { automatisations, etatOutil, ficheProspect, fil, referentiels } from "@/server/donnees";
import { EnTetePage } from "@/components/interface/elements";
import { ModaleFiche } from "../fiche";
import { ListeAutomatisations } from "./automatisation";

/**
 * Page Workflow (spec 001-workflows) : les automatisations régulières qui alimentent la file
 * d'attente. Une automatisation = un encadré extensible (même mécanique que Réglages). Un prospect
 * des logs s'ouvre par-dessus la page (?prospect=…), comme dans Prospects et l'Inbox.
 */
export default function PageWorkflow({ searchParams }: PageProps<"/workflow">) {
  return (
    <section className="flex max-w-[960px] flex-col gap-6">
      <EnTetePage titre="Workflow" description="Des automatisations régulières qui alimentent la file d'attente, sous les mêmes quotas que tes actions" />
      <Suspense fallback={<SqueletteWorkflow />}>
        <Contenu />
      </Suspense>
      <Suspense fallback={null}>
        <Fiche searchParams={searchParams} />
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

/** Fiche prospect ouverte depuis les logs : modale sur ordinateur, panneau du bas sur téléphone. */
async function Fiche({ searchParams }: { searchParams: PageProps<"/workflow">["searchParams"] }) {
  const sp = await searchParams;
  const id = Array.isArray(sp.prospect) ? sp.prospect[0] : sp.prospect;
  if (!id) return null;
  const [fiche, refs, etat, conversation] = await Promise.all([ficheProspect(id), referentiels(), etatOutil(), fil({ prospectId: id })]);
  if (!fiche) return null;
  return (
    <ModaleFiche
      fiche={fiche}
      libelleEtape={refs.etapes.find((e) => e.code === fiche.etape)?.libelle ?? fiche.etape}
      conversation={conversation}
      restants={Math.max(0, (etat.quotas.message.plafond.jour ?? 0) - etat.quotas.message.compteur.jour)}
      modeSimule={etat.modeSimule}
    />
  );
}
