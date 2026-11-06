import { Suspense } from "react";
import Link from "next/link";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import { filtresProspectsSchema, prospects, referentiels, TAILLE_PAGE } from "@/server/donnees";
import { LIBELLES_STATUT } from "@/lib/statut-relation";

export default function PageProspects({ searchParams }: PageProps<"/">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Prospects</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <Liste searchParams={searchParams} />
      </Suspense>
    </section>
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
  const [{ lignes, total }, refs] = await Promise.all([prospects(filtres), referentiels()]);
  const libelleEtape = new Map(refs.etapes.map((e) => [e.code, e.libelle]));
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  const lienPage = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const s = premier(v);
      if (s && k !== "page") q.set(k, s);
    }
    q.set("page", String(p));
    return `/?${q.toString()}`;
  };

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm" role="search">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Recherche</span>
          <input name="q" defaultValue={filtres.recherche} maxLength={100} className="rounded-lg border border-neutral-300 px-3 py-1.5" placeholder="Nom, entreprise…" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Statut</span>
          <select name="statut" defaultValue={filtres.statut ?? ""} className="rounded-lg border border-neutral-300 px-3 py-1.5">
            <option value="">Tous</option>
            {Object.entries(LIBELLES_STATUT).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Étape</span>
          <select name="etape" defaultValue={filtres.etape ?? ""} className="rounded-lg border border-neutral-300 px-3 py-1.5">
            <option value="">Toutes</option>
            {refs.etapes.map((e) => (
              <option key={e.code} value={e.code}>{e.libelle}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Liste d&apos;origine</span>
          <select name="liste" defaultValue={filtres.liste ?? ""} className="rounded-lg border border-neutral-300 px-3 py-1.5">
            <option value="">Toutes</option>
            {refs.listes.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Relance avant le</span>
          <input type="date" name="relance" defaultValue={filtres.relanceAvant} className="rounded-lg border border-neutral-300 px-3 py-1.5" />
        </label>
        <button type="submit" className="rounded-lg bg-[#b5443d] px-4 py-1.5 font-medium text-white hover:bg-[#9c3a34]">Filtrer</button>
        <Link href="/" className="px-2 py-1.5 text-neutral-600 hover:underline">Réinitialiser</Link>
      </form>

      <p className="text-sm text-neutral-600">{total} prospect{total > 1 ? "s" : ""}</p>

      {lignes.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">
          Aucun prospect. <Link href="/import" className="text-[#b3403a] underline">Importer une liste</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Entreprise · poste</th>
                <th className="px-4 py-3 font-medium">Relation</th>
                <th className="px-4 py-3 font-medium">Étape</th>
                <th className="px-4 py-3 font-medium">Relance</th>
                <th className="px-4 py-3 font-medium">Liste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lignes.map((p) => (
                <tr key={p.id} className="hover:bg-[#f5f2f2]/60">
                  <td className="px-4 py-3">
                    <span className="font-medium">{[p.prenom, p.nom].filter(Boolean).join(" ") || "—"}</span>
                    {!p.identifie && <span className="ml-2 text-xs text-neutral-400" title="Profil pas encore lu (lecture en file)">· en file</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{[p.entreprise, p.poste].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3"><BadgeStatut statut={p.statutRelation} /></td>
                  <td className="px-4 py-3"><BadgeEtape libelle={libelleEtape.get(p.etape) ?? p.etape} /></td>
                  <td className="px-4 py-3 text-neutral-600">{p.prochaineRelance ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{p.listeOrigine ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          {filtres.page > 1 && <Link href={lienPage(filtres.page - 1)} className="rounded-lg px-3 py-1.5 hover:bg-white">← Précédent</Link>}
          <span className="text-neutral-600">Page {filtres.page} / {pages}</span>
          {filtres.page < pages && <Link href={lienPage(filtres.page + 1)} className="rounded-lg px-3 py-1.5 hover:bg-white">Suivant →</Link>}
        </nav>
      )}
    </>
  );
}
