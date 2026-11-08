import { Suspense } from "react";
import Link from "next/link";
import {
  etatOutil,
  ficheProspect,
  fil,
  filtresProspectsSchema,
  prospects,
  referentiels,
  statsProspects,
  TAILLE_PAGE,
} from "@/server/donnees";
import { BoutonDemo } from "@/components/bouton-demo";
import { Chiffre, EnTetePage, EtatVide, SqueletteCartes, SqueletteLignes } from "@/components/interface/elements";
import { IconeCalendrier, IconeAttente, IconeImport, IconeInbox, IconeProspects, IconeRecherche } from "@/components/icones";
import { PanneauFiche } from "./fiche";
import { TableProspects } from "./liste-prospects";
import { ChampRecherche, FournisseurRecherche } from "./recherche-prospects";

export default function PageProspects({ searchParams }: PageProps<"/">) {
  return (
    <section className="flex flex-col gap-6">
      <EnTetePage
        titre="Prospects"
        actions={
          <Link href="/import" className="bouton bouton-plein">
            <IconeImport taille={18} />
            Importer
          </Link>
        }
      />
      <Suspense fallback={<SqueletteCartes />}>
        <Indicateurs />
      </Suspense>
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

async function Indicateurs() {
  const s = await statsProspects();
  const cartes = [
    { libelle: "En relation", valeur: s.parStatut.en_relation, aide: `sur ${s.total} prospects`, Icone: IconeProspects, href: "/?statut=en_relation" },
    { libelle: "Invitations en attente", valeur: s.parStatut.en_attente, aide: "acceptation non reçue", Icone: IconeAttente, href: "/?statut=en_attente" },
    { libelle: "Réponses à traiter", valeur: s.aTraiter, aide: "dernier message reçu", Icone: IconeInbox, href: "/inbox?filtre=a_traiter", accent: s.aTraiter > 0 },
    { libelle: "Relances dues", valeur: s.relancesDues, aide: "aujourd'hui ou en retard", Icone: IconeCalendrier, href: `/?relance=${new Date().toISOString().slice(0, 10)}`, accent: s.relancesDues > 0 },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cartes.map((c) => (
        <Link
          key={c.libelle}
          href={c.href}
          className="carte group flex flex-col gap-3 p-4 outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus-visible:shadow-[0_0_0_3px_rgba(224,98,90,0.35)]"
        >
          <span className="flex items-center justify-between">
            <span className="body-5 text-encre-2">{c.libelle}</span>
            <span className={`grid size-8 place-items-center rounded-lg ${c.accent ? "bg-accent-doux text-action" : "bg-creux text-encre-3"}`}>
              <c.Icone taille={18} />
            </span>
          </span>
          <span className="flex items-baseline gap-2">
            <Chiffre valeur={c.valeur} className="chiffre-cle text-encre" />
            <span className="caption-5 text-encre-3">{c.aide}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function premier(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

async function Liste({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const parse = filtresProspectsSchema.safeParse({
    statut: premier(sp.statut),
    etape: premier(sp.etape),
    liste: premier(sp.liste),
    relanceAvant: premier(sp.relance),
    recherche: premier(sp.q),
    page: premier(sp.page) ?? 1,
  });
  const filtres = parse.success ? parse.data : { page: 1 };
  const idFiche = premier(sp.prospect);
  const [{ lignes, total }, refs, etat, fiche, conversation] = await Promise.all([
    prospects(filtres),
    referentiels(),
    etatOutil(),
    idFiche ? ficheProspect(idFiche) : null,
    idFiche ? fil({ prospectId: idFiche }) : null,
  ]);
  const etapes = Object.fromEntries(refs.etapes.map((e) => [e.code, e.libelle]));
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const filtre = !!(filtres.recherche || filtres.etape || filtres.liste || filtres.relanceAvant || filtres.statut);

  const lienPage = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const s = premier(v);
      if (s && k !== "page" && k !== "prospect") q.set(k, s);
    }
    q.set("page", String(p));
    return `/?${q.toString()}`;
  };

  return (
    <FournisseurRecherche initiale={filtres.recherche?.trim() ?? ""}>
      <div className="flex flex-col gap-3">
        <form className="flex flex-wrap items-center gap-2" role="search">
          {filtres.statut && <input type="hidden" name="statut" value={filtres.statut} />}
          {filtres.recherche && <input type="hidden" name="q" value={filtres.recherche} />}
          <ChampRecherche />
          <label>
            <span className="sr-only">Étape</span>
            <select name="etape" defaultValue={filtres.etape ?? ""} className="champ w-auto">
              <option value="">Toutes les étapes</option>
              {refs.etapes.map((e) => (
                <option key={e.code} value={e.code}>{e.libelle}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Liste d&apos;origine</span>
            <select name="liste" defaultValue={filtres.liste ?? ""} className="champ w-auto">
              <option value="">Toutes les listes</option>
              {refs.listes.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="caption-4 text-encre-3">Relance avant le</span>
            <input type="date" name="relance" defaultValue={filtres.relanceAvant} className="champ w-auto" />
          </label>
          <button type="submit" className="bouton bouton-contour">Filtrer</button>
          {filtre && (
            <Link href="/" className="bouton bouton-discret">
              Réinitialiser
            </Link>
          )}
        </form>
      </div>

      {lignes.length === 0 && !filtres.recherche ? (
        filtre ? (
          <EtatVide icone={<IconeRecherche taille={22} />} titre="Aucun prospect ne correspond" texte="Élargis la recherche ou réinitialise les filtres." action={<Link href="/" className="bouton bouton-contour">Réinitialiser les filtres</Link>} />
        ) : (
          <EtatVide
            icone={<IconeProspects taille={22} />}
            titre="Aucun prospect pour l'instant"
            texte={
              etat.modeSimule
                ? "Importe ta base Notion, ou charge des prospects fictifs pour essayer l'outil avant de brancher Unipile."
                : "Importe l'export CSV de ta base Notion pour commencer."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/import" className="bouton bouton-contour">Importer une liste</Link>
                {etat.modeSimule && etat.prospectsDemo === 0 && <BoutonDemo />}
              </div>
            }
          />
        )
      ) : (
        <>
          <TableProspects lignes={lignes} etapes={etapes} />
          <div className="flex items-center justify-between caption-5 text-encre-3">
            <span>
              {total} prospect{total > 1 ? "s" : ""}
              {pages > 1 && ` · page ${filtres.page} sur ${pages}`}
            </span>
            {pages > 1 && (
              <nav className="flex gap-2" aria-label="Pagination">
                {filtres.page > 1 && <Link href={lienPage(filtres.page - 1)} className="bouton bouton-contour">Précédent</Link>}
                {filtres.page < pages && <Link href={lienPage(filtres.page + 1)} className="bouton bouton-contour">Suivant</Link>}
              </nav>
            )}
          </div>
        </>
      )}

      {fiche && <PanneauFiche fiche={fiche} libelleEtape={etapes[fiche.etape] ?? fiche.etape} conversation={conversation} />}
    </FournisseurRecherche>
  );
}
