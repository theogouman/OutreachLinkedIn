import { Suspense } from "react";
import Link from "next/link";
import { etatOutil, ficheProspect, fil, prospects, referentiels, statsProspects, TAILLE_PAGE } from "@/server/donnees";
import { BoutonDemo } from "@/components/bouton-demo";
import { EnTetePage, EtatVide, SqueletteCartes, SqueletteLignes } from "@/components/interface/elements";
import { IconeProspects } from "@/components/icones";
import { ModaleFiche } from "./fiche";
import { ListeProspects } from "./liste-prospects";

export default function PageProspects({ searchParams }: PageProps<"/">) {
  return (
    <section className="flex flex-col gap-6">
      <EnTetePage titre="Prospects" />
      <Suspense
        fallback={
          <>
            <SqueletteCartes />
            <span className="squelette block h-10 w-full max-w-xl rounded-xl" />
            <SqueletteLignes />
          </>
        }
      >
        <Liste searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function premier(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

/**
 * Données de départ (sans filtre) ; les filtres vivent ensuite dans le client
 * (ListeProspects, standard useListeFiltree), sans URL. Seule la fiche ouverte
 * reste dans l'URL (?prospect=id), pour pouvoir la partager.
 */
async function Liste({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const idFiche = premier(sp.prospect);
  const [initial, refs, etat, stats, fiche, conversation] = await Promise.all([
    prospects({ page: 1 }),
    referentiels(),
    etatOutil(),
    statsProspects(),
    idFiche ? ficheProspect(idFiche) : null,
    idFiche ? fil({ prospectId: idFiche }) : null,
  ]);
  const etapes = Object.fromEntries(refs.etapes.map((e) => [e.code, e.libelle]));

  return (
    <>
      <ListeProspects
        initial={initial}
        stats={stats}
        etapes={refs.etapes.map((e) => ({ code: e.code, libelle: e.libelle }))}
        listes={refs.listes}
        taillePage={TAILLE_PAGE}
        videSansFiltre={
          <EtatVide
            icone={<IconeProspects taille={20} />}
            titre="Aucun prospect pour l'instant"
            texte={
              etat.modeSimule
                ? "Importe ta base Notion, ou charge des prospects fictifs pour essayer l'outil avant de brancher Unipile"
                : "Importe l'export CSV de ta base Notion pour commencer"
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/import" className="bouton bouton-contour">Importer une liste</Link>
                {etat.modeSimule && etat.prospectsDemo === 0 && <BoutonDemo />}
              </div>
            }
          />
        }
      />
      {fiche && (
        <ModaleFiche
          fiche={fiche}
          libelleEtape={etapes[fiche.etape] ?? fiche.etape}
          conversation={conversation}
          restants={Math.max(0, (etat.quotas.message.plafond.jour ?? 0) - etat.quotas.message.compteur.jour)}
          modeSimule={etat.modeSimule}
        />
      )}
    </>
  );
}
