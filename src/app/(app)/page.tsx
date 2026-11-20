import { Suspense } from "react";
import { etatOutil, ficheProspect, fil, prospects, referentiels, TAILLE_PAGE, vues } from "@/server/donnees";
import { filtresProspectsDepuisUrl } from "@/lib/filtres/prospects";
import { EnTetePage, EtatVide, SqueletteLignes } from "@/components/interface/elements";
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
  // Lien direct depuis les cartes de la page Statistiques (?statut=, ?relance=dues).
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const filtresInitiaux = filtresProspectsDepuisUrl({ statut: premier(sp.statut), relance: premier(sp.relance) }, aujourdhui);
  const [initial, refs, etat, fiche, conversation, listeVues] = await Promise.all([
    prospects(filtresInitiaux),
    referentiels(),
    etatOutil(),
    idFiche ? ficheProspect(idFiche) : null,
    idFiche ? fil({ prospectId: idFiche }) : null,
    vues(),
  ]);
  const etapes = Object.fromEntries(refs.etapes.map((e) => [e.code, e.libelle]));

  return (
    <>
      <ListeProspects
        initial={initial}
        filtresInitiaux={filtresInitiaux}
        etapes={refs.etapes.map((e) => ({ code: e.code, libelle: e.libelle }))}
        listes={refs.listes}
        vues={listeVues}
        vueInitiale={premier(sp.vue) ?? null}
        taillePage={TAILLE_PAGE}
        videSansFiltre={
          <EtatVide
            icone={<IconeProspects taille={20} />}
            titre="Aucun prospect pour l'instant"
            texte="Demande à Claude d'importer une liste pour commencer"
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
