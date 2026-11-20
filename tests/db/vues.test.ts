import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { creerVue, majOptionsVue, renommerVue, supprimerVue, vuesDepuis } from "@/server/vues";
import { EnvoiRefuse, modifierPropriete } from "@/server/mutations";
import { synchroniserEtapes } from "@/server/etapes";

const AUTORISE = "theo@example.com";

describe.skipIf(!TEST_DATABASE_URL)("vues enregistrées et propriétés modifiables", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("delete from public.vues where nom not in ('Table', 'Galerie')");
    await db.pool.query("truncate public.prospects cascade");
  });

  it("deux vues de départ : la table actuelle et la galerie", async () => {
    const v = await vuesDepuis(db.pool);
    expect(v.map((x) => [x.nom, x.type])).toEqual([
      ["Table", "table"],
      ["Galerie", "galerie"],
    ]);
    expect(v[1]!.options.proprietes).toContain("liste");
  });

  it("RLS : rien pour un visiteur ni un intrus ; lecture seule pour l'utilisateur autorisé", async () => {
    await expect(asUser(db.pool, null, (c) => c.query("select * from public.vues"))).rejects.toThrow(/permission denied/);
    expect((await asUser(db.pool, "intrus@example.com", (c) => c.query("select * from public.vues"))).rowCount).toBe(0);
    expect((await asUser(db.pool, AUTORISE, (c) => c.query("select * from public.vues"))).rowCount).toBe(2);
    await expect(
      asUser(db.pool, AUTORISE, (c) => c.query("insert into public.vues (liste, nom, type) values ('prospects', 'x', 'table')")),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("delete from public.vues"))).rejects.toThrow(/permission denied/);
  });

  it("créer, renommer, régler et supprimer une vue ; entrées invalides refusées", async () => {
    const id = await creerVue(db.pool, { nom: "  Mes cartes  ", type: "galerie" });
    await renommerVue(db.pool, { id, nom: "Cartes" });
    await majOptionsVue(db.pool, { id, options: { proprietes: ["etape", "liste", "etape"] } });
    const v = (await vuesDepuis(db.pool)).find((x) => x.id === id);
    expect(v).toEqual({ id, nom: "Cartes", type: "galerie", options: { proprietes: ["etape", "liste"] } });

    await expect(creerVue(db.pool, { nom: "x", type: "kanban" })).rejects.toThrow();
    await expect(creerVue(db.pool, { nom: "   ", type: "table" })).rejects.toThrow();
    await expect(majOptionsVue(db.pool, { id, options: { proprietes: ["mot_de_passe"] } })).rejects.toThrow();
    await expect(renommerVue(db.pool, { id: "pas-un-uuid", nom: "x" })).rejects.toThrow();
    await supprimerVue(db.pool, id);
    expect(await vuesDepuis(db.pool)).toHaveLength(2);
  });

  it("refuse en base des réglages qui ne sont pas un objet, et garde toujours une vue", async () => {
    await expect(db.pool.query("insert into public.vues (liste, nom, type, options) values ('prospects', 'x', 'table', '[]')")).rejects.toThrow(
      /vues_options_objet/,
    );
    const [a, b] = await vuesDepuis(db.pool);
    await supprimerVue(db.pool, a!.id);
    await expect(supprimerVue(db.pool, b!.id)).rejects.toThrow(EnvoiRefuse);
    // Remise en état pour les autres tests.
    await db.pool.query("insert into public.vues (liste, nom, type, options, ordre) values ('prospects', 'Table', 'table', '{\"proprietes\": []}', 0)");
  });

  it("réglages abîmés en base : remplacés par ceux par défaut à la lecture", async () => {
    await db.pool.query("update public.vues set options = '{\"proprietes\": [\"inconnue\"]}' where nom = 'Galerie'");
    const g = (await vuesDepuis(db.pool)).find((x) => x.nom === "Galerie");
    expect(g?.options.proprietes).toEqual(["entreprise", "relation", "etape", "liste"]);
  });

  it("liste d'origine modifiable parmi les listes existantes ; relation refusée", async () => {
    const r = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, liste_origine) values
         ('a', 'linkedin.com/in/a', 'Salon'), ('b', 'linkedin.com/in/b', 'Webinar') returning id`,
    );
    const [a] = r.rows.map((x) => x.id as string);
    await modifierPropriete(db.pool, { prospectId: a, cle: "liste", valeur: "Webinar" });
    expect((await db.pool.query("select liste_origine from public.prospects where id = $1", [a])).rows[0].liste_origine).toBe("Webinar");
    await modifierPropriete(db.pool, { prospectId: a, cle: "liste", valeur: "  " });
    expect((await db.pool.query("select liste_origine from public.prospects where id = $1", [a])).rows[0].liste_origine).toBeNull();

    await expect(modifierPropriete(db.pool, { prospectId: a, cle: "liste", valeur: "Inventée" })).rejects.toThrow(EnvoiRefuse);
    await expect(modifierPropriete(db.pool, { prospectId: a, cle: "relation", valeur: "en_relation" })).rejects.toThrow();
    await expect(modifierPropriete(db.pool, { prospectId: "x", cle: "liste", valeur: "Salon" })).rejects.toThrow();
    await expect(
      modifierPropriete(db.pool, { prospectId: "00000000-0000-4000-8000-000000000000", cle: "liste", valeur: "Salon" }),
    ).rejects.toThrow(EnvoiRefuse);
  });

  it("étape modifiable à la main : étape connue seulement, journal « manuel », sans doublon ; synchro sans recul", async () => {
    const a = (
      await db.pool.query("insert into public.prospects (linkedin_url, url_normalisee, etape) values ('e', 'linkedin.com/in/e', 'repondu') returning id")
    ).rows[0].id as string;
    const etape = async () => (await db.pool.query("select etape from public.prospects where id = $1", [a])).rows[0].etape;
    const journal = async () =>
      (await db.pool.query("select details from public.actions where prospect_id = $1 and type = 'changement_etape' order by created_at", [a])).rows.map((r) => r.details);

    await modifierPropriete(db.pool, { prospectId: a, cle: "etape", valeur: "gagne" });
    expect(await etape()).toBe("gagne");
    expect(await journal()).toEqual([{ de: "repondu", vers: "gagne", cause: "manuel" }]);
    // Même étape : rien n'est noté.
    await modifierPropriete(db.pool, { prospectId: a, cle: "etape", valeur: "gagne" });
    expect(await journal()).toHaveLength(1);
    // Étape terminale posée à la main : la synchronisation ne la touche plus.
    const c = await db.pool.connect();
    try {
      await synchroniserEtapes(c, [a], "synchro");
    } finally {
      c.release();
    }
    expect(await etape()).toBe("gagne");

    await expect(modifierPropriete(db.pool, { prospectId: a, cle: "etape", valeur: "inventee" })).rejects.toThrow(EnvoiRefuse);
    await expect(modifierPropriete(db.pool, { prospectId: a, cle: "etape", valeur: "x".repeat(200) })).rejects.toThrow();
    await expect(
      modifierPropriete(db.pool, { prospectId: "00000000-0000-4000-8000-000000000000", cle: "etape", valeur: "gagne" }),
    ).rejects.toThrow(EnvoiRefuse);
    expect(await etape()).toBe("gagne");
  });
});
