import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { associerProspects, dissocierProspect, personnesAssocieesDepuis, regrouperParEntreprise } from "@/server/associations";

const etat = vi.hoisted(() => ({ pool: null as unknown, connecte: true }));
vi.mock("@/server/auth", () => ({
  exigerUtilisateur: async () => {
    if (!etat.connecte) throw new Error("NEXT_REDIRECT /login");
    return { email: "theo@example.com" };
  },
}));
vi.mock("@/server/db", () => ({ poolServeur: () => etat.pool }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

describe.skipIf(!TEST_DATABASE_URL)("personnes associées", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    db = await createTestDb();
    etat.pool = db.pool;
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    etat.connecte = true;
    await db.pool.query("truncate public.prospects, public.groupes_personnes cascade");
    const gens: [string, string, string | null][] = [
      ["steve", "Steve Anavi", "Qonto"],
      ["alexandre", "Alexandre Prot", "qonto "],
      ["sarah", "Sarah Ben Allel", "Qonto"],
      ["cyril", "Cyril Chiche", "Lydia"],
      ["antoine", "Antoine Porte", "Lydia"],
      ["eva", "Eva Vendetti", "Self-employed"],
      ["louis", "Louis Pinet", "Self-employed"],
      ["seul", "Seul Ensonentreprise", "Unique SAS"],
    ];
    for (const [cle, nom, entreprise] of gens) {
      const [prenom, ...reste] = nom.split(" ");
      ids[cle] = (
        await db.pool.query(
          "insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, entreprise) values ($1, $1, $2, $3, $4) returning id",
          [`linkedin.com/in/${cle}`, prenom, reste.join(" "), entreprise],
        )
      ).rows[0].id;
    }
    // Profil enrichi : son nom d'entreprise l'emporte sur celui de la fiche.
    await db.pool.query("update public.prospects set entreprise = 'Ancienne boîte' where id = $1", [ids.sarah]);
    await db.pool.query("insert into public.profils_linkedin (prospect_id, source, lu_le, entreprise) values ($1, 'apify', now(), $2)", [
      ids.sarah,
      { nom: "Qonto" },
    ]);
  });
  const groupe = async (cle: string) => (await db.pool.query("select groupe_id from public.prospects where id = $1", [ids[cle]])).rows[0].groupe_id;
  const nbGroupes = async () => (await db.pool.query("select count(*)::int as n from public.groupes_personnes")).rows[0].n;

  it("regroupement initial par entreprise : sans casse ni espaces, profil enrichi d'abord, libellés génériques et entreprises seules exclus", async () => {
    expect(await regrouperParEntreprise(db.pool)).toEqual({ groupes: 2, personnes: 5 });
    expect(await groupe("steve")).toBe(await groupe("alexandre"));
    expect(await groupe("sarah")).toBe(await groupe("steve"));
    expect(await groupe("cyril")).toBe(await groupe("antoine"));
    expect(await groupe("cyril")).not.toBe(await groupe("steve"));
    for (const cle of ["eva", "louis", "seul"]) expect(await groupe(cle)).toBeNull();
    // Rejoué : rien de neuf (personne sans groupe à regrouper).
    expect(await regrouperParEntreprise(db.pool)).toEqual({ groupes: 0, personnes: 0 });
  });

  it("associer : crée, complète puis fusionne les groupes ; dissocier ; un groupe d'une personne disparaît", async () => {
    await associerProspects(db.pool, { prospectId: ids.steve, autreId: ids.cyril });
    expect(await groupe("steve")).toBe(await groupe("cyril"));
    await associerProspects(db.pool, { prospectId: ids.antoine, autreId: ids.cyril });
    expect(await groupe("antoine")).toBe(await groupe("steve"));
    await associerProspects(db.pool, { prospectId: ids.eva, autreId: ids.louis });
    expect(await nbGroupes()).toBe(2);
    await associerProspects(db.pool, { prospectId: ids.steve, autreId: ids.louis });
    expect(await nbGroupes()).toBe(1);
    expect(await groupe("eva")).toBe(await groupe("steve"));

    for (const cle of ["eva", "louis", "antoine", "cyril"]) await dissocierProspect(db.pool, ids[cle]);
    expect(await groupe("steve")).toBeNull();
    expect(await nbGroupes()).toBe(0);
    await dissocierProspect(db.pool, ids.seul); // sans groupe : sans effet
  });

  it("lecture : associés (sans soi) et suggestions de même entreprise hors du groupe", async () => {
    await associerProspects(db.pool, { prospectId: ids.steve, autreId: ids.alexandre });
    const r = await personnesAssocieesDepuis(db.pool, ids.steve);
    expect(r.associes.map((x) => x.nom)).toEqual(["Alexandre Prot"]);
    expect(r.suggestions.map((x) => x.nom)).toEqual(["Sarah Ben Allel"]);
    expect((await personnesAssocieesDepuis(db.pool, ids.eva)).suggestions).toEqual([]); // libellé générique
    expect(await personnesAssocieesDepuis(db.pool, ids.seul)).toEqual({ associes: [], suggestions: [] });
  });

  it("entrées refusées : soi-même, inconnu, invalide ; actions sans session refusées avant écriture", async () => {
    await expect(associerProspects(db.pool, { prospectId: ids.steve, autreId: ids.steve })).rejects.toThrow();
    await expect(associerProspects(db.pool, { prospectId: ids.steve, autreId: crypto.randomUUID() })).rejects.toThrow(/introuvable/);
    await expect(associerProspects(db.pool, { prospectId: "x", autreId: ids.steve })).rejects.toThrow();
    await expect(associerProspects(db.pool, { prospectId: ids.steve, autreId: ids.cyril, groupe: "pirate" })).rejects.toThrow();
    await expect(dissocierProspect(db.pool, "pas-un-uuid")).rejects.toThrow();

    const { actionAssocierProspects, actionDissocierProspect } = await import("@/app/actions");
    etat.connecte = false;
    await expect(actionAssocierProspects({ prospectId: ids.steve, autreId: ids.cyril })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actionDissocierProspect(ids.steve)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await nbGroupes()).toBe(0);
    etat.connecte = true;
    expect(await actionAssocierProspects({ prospectId: ids.steve, autreId: ids.cyril })).toMatchObject({ ok: true });
    expect(await actionAssocierProspects({ prospectId: ids.steve, autreId: ids.steve })).toEqual({ ok: false, message: "Valeurs invalides." });
  });
});
