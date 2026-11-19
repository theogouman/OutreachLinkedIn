import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { ficheProspectDepuis } from "@/server/donnees";

describe.skipIf(!TEST_DATABASE_URL)("informations propres à la liste d'origine", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.liens_linkedin, public.prospects cascade");
  });

  it("la fiche n'affiche que les informations de la liste du prospect", async () => {
    const ins = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, liste_origine, details) values
         ('https://www.linkedin.com/in/dora', 'linkedin.com/in/dora', 'Page Notion Publique',
          '{"pageNotion": "https://acme.notion.site/Kit", "requete": "kit presse", "usageNotion": "Wiki"}'),
         ('https://www.linkedin.com/in/emil', 'linkedin.com/in/emil', 'LM', '{"requete": "kit presse"}')
       returning url_normalisee, id`,
    );
    const id = Object.fromEntries(ins.rows.map((r) => [r.url_normalisee, r.id]));
    const dora = await ficheProspectDepuis(db.pool, id["linkedin.com/in/dora"]);
    expect(dora?.informationsListe.map((i) => i.libelle)).toEqual(["Page Notion", "Requête", "Usage Notion"]);
    const emil = await ficheProspectDepuis(db.pool, id["linkedin.com/in/emil"]);
    expect(emil?.informationsListe).toEqual([]);
  });

  it("refuse en base des informations de liste qui ne sont pas un objet", async () => {
    await expect(
      db.pool.query("insert into public.prospects (linkedin_url, url_normalisee, details) values ('x', 'linkedin.com/in/xyz', '[1]'::jsonb)"),
    ).rejects.toThrow(/prospects_details_objet/);
  });

  it("ni un visiteur non connecté ni un autre utilisateur ne lisent les informations de liste", async () => {
    await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, details) values ('x', 'linkedin.com/in/alice', '{\"requete\": \"a\"}')",
    );
    const intrus = await asUser(db.pool, "intrus@example.com", (c) => c.query("select details from public.prospects"));
    expect(intrus.rows).toEqual([]);
    await expect(asUser(db.pool, null, (c) => c.query("select details from public.prospects"))).rejects.toThrow(/permission denied/);
  });
});
