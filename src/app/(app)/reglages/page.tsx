import { Suspense } from "react";
import { etatOutil, fileAttente, reglages } from "@/server/donnees";
import { EnTetePage } from "@/components/interface/elements";
import { IconeCalendrier, IconeDemo, IconeFile, IconeFiltre } from "@/components/icones";
import { resumeDemo, resumeFile, resumePlafonds, resumeRythme } from "@/lib/reglages";
import { PanneauDemo } from "./demo";
import { ContenuFile } from "./file";
import { FormPlafonds, FormReglages } from "./formulaires";
import { ReglagesMaitre } from "./reglages-maitre";

/**
 * Page maître des Réglages : un encadré extensible par réglage (src/components/interface/
 * reglage-extensible.tsx). Ajouter un réglage : une clé dans SECTIONS_REGLAGES (src/lib/reglages.ts),
 * son résumé, et une entrée ici.
 */
export default function PageReglages() {
  return (
    <section className="flex max-w-[960px] flex-col gap-6">
      <EnTetePage titre="Réglages" description="La file d'attente et les limites qu'elle respecte, sans exception" />
      <Suspense fallback={<SqueletteReglages />}>
        <Contenu />
      </Suspense>
    </section>
  );
}

function SqueletteReglages() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Chargement">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="carte flex items-center gap-3 px-5 py-4 sm:px-6 sm:py-5">
          <span className="squelette size-9 rounded-xl" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="squelette h-4 w-40" />
            <span className="squelette h-3 w-64 max-w-full" />
          </span>
        </div>
      ))}
    </div>
  );
}

async function Contenu() {
  const [r, etat, taches] = await Promise.all([reglages(), etatOutil(), fileAttente()]);
  return (
    <ReglagesMaitre
      sections={[
        {
          cle: "file",
          icone: <IconeFile taille={18} />,
          titre: "File d'attente",
          description: "Chaque action LinkedIn part dans l'ordre de demande, sous les quotas et dans les plages horaires. Rien ne part deux fois",
          resume: resumeFile(etat.enAttente, etat.incertaines),
          alerte: etat.incertaines > 0,
          contenu: <ContenuFile taches={taches} />,
        },
        {
          cle: "plafonds",
          icone: <IconeFiltre taille={18} />,
          titre: "Plafonds du compte LinkedIn",
          description: "Compte gratuit. Jamais au-dessus de la recommandation Unipile, indiquée sous chaque valeur",
          resume: resumePlafonds(r.plafonds),
          contenu: <FormPlafonds initial={r.plafonds} />,
        },
        {
          cle: "rythme",
          icone: <IconeCalendrier taille={18} />,
          titre: "Rythme d'activité",
          description: "Quand l'outil a le droit d'agir, et à quelle allure. Heure de Paris",
          resume: resumeRythme(r.plages),
          contenu: <FormReglages initial={{ plages: r.plages, delaiMinS: r.delaiMinS, delaiMaxS: r.delaiMaxS, cadence: r.cadence }} />,
        },
        {
          cle: "demo",
          icone: <IconeDemo taille={18} />,
          titre: "Données de démonstration",
          description: "Prospects, entreprises et conversations fictifs avec trois semaines d'historique, pour essayer l'outil sans Unipile",
          resume: resumeDemo(etat.modeSimule, etat.prospectsDemo),
          contenu: <PanneauDemo modeSimule={etat.modeSimule} prospectsDemo={etat.prospectsDemo} />,
        },
      ]}
    />
  );
}
