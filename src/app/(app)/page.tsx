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
import { Chiffre, EtatVide, FiltrePilule, Onglets, SqueletteLignes } from "@/components/interface/elements";
import { FormulaireAuto } from "@/components/interface/formulaire-auto";
import { IconeProspects, IconeRecherche } from "@/components/icones";
import { PanneauFiche } from "./fiche";
import { TableProspects } from "./liste-prospects";

export default function PageProspects({ searchParams }: PageProps<"/">) {
  return (
    <section className="flex flex-col">
      <Suspense
        fallback={
          <>
            <span className="squelette mx-4 my-4 block h-[30px] w-full max-w-xl rounded-full" />
            <SqueletteLignes />
          </>
        }
      >
        <Liste searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

/** Bande d'indicateurs (cellules du pied de tableau sales-crm). */
async function Indicateurs() {
  const s = await statsProspects();
  const cellules = [
    { libelle: "En relation", valeur: s.parStatut.en_relation, href: "/?statut=en_relation" },
    { libelle: "Invitations en attente", valeur: s.parStatut.en_attente, href: "/?statut=en_attente" },
    { libelle: "Réponses à traiter", valeur: s.aTraiter, href: "/inbox?filtre=a_traiter", accent: s.aTraiter > 0 },
    { libelle: "Relances dues", valeur: s.relancesDues, href: `/?relance=${new Date().toISOString().slice(0, 10)}`, accent: s.relancesDues > 0 },
  ];
  return (
    <div className="grid grid-cols-2 border-b border-trait lg:grid-cols-4">
      {cellules.map((c, i) => (
        <Link
          key={c.libelle}
          href={c.href}
          className={`flex flex-col gap-2 border-trait px-4 py-3 outline-none transition-colors duration-150 hover:bg-white/[0.025] focus-visible:bg-white/[0.04] ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} ${i === 1 ? "lg:border-r" : ""}`}
        >
          <span className="caption-4 text-encre-3">{c.libelle}</span>
          <span className="flex items-center gap-2">
            <Chiffre valeur={c.valeur} className="text-[20px] font-medium leading-none tracking-[-0.02em] text-encre" />
            {c.accent && <span className="size-1.5 rounded-full bg-accent" aria-label="À traiter" />}
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
  const [{ lignes, total }, refs, stats, etat, fiche, conversation] = await Promise.all([
    prospects(filtres),
    referentiels(),
    statsProspects(),
    etatOutil(),
    idFiche ? ficheProspect(idFiche) : null,
    idFiche ? fil({ prospectId: idFiche }) : null,
  ]);
  const etapes = Object.fromEntries(refs.etapes.map((e) => [e.code, e.libelle]));
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const filtre = !!(filtres.recherche || filtres.etape || filtres.liste || filtres.relanceAvant || filtres.statut);
  const lienStatut = (statut?: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = premier(v);
      if (val && !["page", "prospect", "statut"].includes(k)) q.set(k, val);
    }
    if (statut) q.set("statut", statut);
    return q.size ? `/?${q}` : "/";
  };
  const onglets = [
    { href: lienStatut(), libelle: "Tous", compte: stats.total, actif: !filtres.statut },
    { href: lienStatut("en_relation"), libelle: "En relation", compte: stats.parStatut.en_relation, actif: filtres.statut === "en_relation" },
    { href: lienStatut("en_attente"), libelle: "En attente", compte: stats.parStatut.en_attente, actif: filtres.statut === "en_attente" },
    { href: lienStatut("invitation_recue"), libelle: "Reçues", compte: stats.parStatut.invitation_recue, actif: filtres.statut === "invitation_recue" },
    { href: lienStatut("a_inviter"), libelle: "À inviter", compte: stats.parStatut.a_inviter, actif: filtres.statut === "a_inviter" },
  ];

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
    <>
      <Onglets libelle="Filtrer par statut de relation" onglets={onglets} />
      <Suspense fallback={<span className="block h-[63px] border-b border-trait" />}>
        <Indicateurs />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
        <FormulaireAuto className="flex min-w-0 flex-wrap items-center gap-2" role="search">
          {filtres.statut && <input type="hidden" name="statut" value={filtres.statut} />}
          <label className="relative w-full sm:w-[220px]">
            <span className="sr-only">Rechercher</span>
            <IconeRecherche taille={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
            <input
              name="q"
              defaultValue={filtres.recherche}
              maxLength={100}
              placeholder="Rechercher"
              className="h-[30px] w-full rounded-full bg-creux pl-7 pr-3 text-[12px] text-encre shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none placeholder:text-encre-3 focus-visible:outline-2 focus-visible:outline-accent/70"
            />
          </label>
          <FiltrePilule libelle="Étape" name="etape" defaultValue={filtres.etape ?? ""}>
            <option value="">Toutes</option>
            {refs.etapes.map((e) => (
              <option key={e.code} value={e.code}>{e.libelle}</option>
            ))}
          </FiltrePilule>
          <FiltrePilule libelle="Liste" name="liste" defaultValue={filtres.liste ?? ""}>
            <option value="">Toutes</option>
            {refs.listes.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </FiltrePilule>
          <label className="bouton h-[30px] gap-0 overflow-hidden p-0">
            <span className="px-[9px] font-normal text-encre-3">Relance avant</span>
            <span aria-hidden className="h-full w-px bg-white/[0.08]" />
            <input type="date" name="relance" defaultValue={filtres.relanceAvant} className="h-full bg-transparent px-[9px] text-[12px] text-encre outline-none [color-scheme:dark]" />
          </label>
          <button type="submit" className="sr-only">Filtrer</button>
          {filtre && (
            <Link href="/" className="bouton bouton-discret">
              Réinitialiser
            </Link>
          )}
        </FormulaireAuto>
        <Link href="/import" className="bouton bouton-plein">
          <svg viewBox="0 0 256 256" className="size-3" fill="currentColor" aria-hidden>
            <path d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8Z" />
          </svg>
          Importer des prospects
        </Link>
      </div>

      {lignes.length === 0 ? (
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
          <div className="flex h-11 items-center justify-between gap-2 border-b border-trait px-4 caption-4 text-encre-3">
            <span>
              <span className="tabular-nums text-encre">{total}</span> prospect{total > 1 ? "s" : ""} dans la vue
              {pages > 1 && ` · page ${filtres.page} sur ${pages}`}
            </span>
            {pages > 1 && (
              <nav className="flex gap-1" aria-label="Pagination">
                {filtres.page > 1 && <Link href={lienPage(filtres.page - 1)} className="bouton">Précédent</Link>}
                {filtres.page < pages && <Link href={lienPage(filtres.page + 1)} className="bouton">Suivant</Link>}
              </nav>
            )}
          </div>
        </>
      )}

      {fiche && <PanneauFiche fiche={fiche} libelleEtape={etapes[fiche.etape] ?? fiche.etape} conversation={conversation} />}
    </>
  );
}
