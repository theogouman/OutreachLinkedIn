import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { importerProspects, importerRelations } from "@/server/import/appliquer";
import { ficheProspectDepuis } from "@/server/donnees";
import type { ProspectCsv } from "@/server/import/prospects-csv";

const p = (id: string): ProspectCsv => ({
  linkedinUrl: `https://www.linkedin.com/in/${id}`,
  urlNormalisee: `linkedin.com/in/${id}`,
  publicIdentifier: id,
  prenom: "P",
  nom: id,
  poste: null,
  entreprise: null,
});

describe.skipIf(!TEST_DATABASE_URL)("étape « Connecté » et informations de liste après import", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.liens_linkedin, public.prospects, public.sync_runs cascade");
  });

  /** bruno : invitation envoyée ; alice : à contacter ; chloe : déjà au premier message. */
  async function semer() {
    await importerProspects(db.pool, [p("alice"), p("bruno"), p("chloe")], null);
    await db.pool.query(
      "insert into public.liens_linkedin (type, url_normalisee, source) values ('invitation_envoyee', 'linkedin.com/in/bruno', 'csv')",
    );
    await db.pool.query(`update public.prospects set etape = case url_normalisee
        when 'linkedin.com/in/bruno' then 'invitation_envoyee' when 'linkedin.com/in/chloe' then 'premier_message' else etape end,
        statut_relation = case when url_normalisee = 'linkedin.com/in/bruno' then 'en_attente'::public.statut_relation else statut_relation end`);
  }

  const etatDe = async (id: string) =>
    (
      await db.pool.query(
        `select p.statut_relation, p.etape,
                (select array_agg(a.type || '@' || to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD') order by a.type)
                   from public.actions a where a.prospect_id = p.id) as journal
           from public.prospects p where p.url_normalisee = $1`,
        [`linkedin.com/in/${id}`],
      )
    ).rows[0];

  const RELATIONS = [
    { urlNormalisee: "linkedin.com/in/bruno", date: new Date("2026-11-05T00:00:00Z") },
    { urlNormalisee: "linkedin.com/in/alice", date: new Date("2024-03-01T00:00:00Z") },
    { urlNormalisee: "linkedin.com/in/chloe", date: new Date("2026-10-01T00:00:00Z") },
  ];

  it("invitation acceptée et relation existante passent à « Connecté », datées de la connexion", async () => {
    await semer();
    const r = await importerRelations(db.pool, RELATIONS);
    expect(r.etapesAvancees).toBe(2);
    expect(await etatDe("bruno")).toEqual({
      statut_relation: "en_relation",
      etape: "connecte",
      journal: ["acceptation@2026-11-05", "changement_etape@2026-11-05"],
    });
    expect(await etatDe("alice")).toEqual({ statut_relation: "en_relation", etape: "connecte", journal: ["changement_etape@2024-03-01"] });
    // Plus loin dans le pipeline : jamais reculé.
    expect(await etatDe("chloe")).toMatchObject({ etape: "premier_message", journal: null });
  });

  it("relations connues avant l'import des prospects : même résultat", async () => {
    await importerRelations(db.pool, [RELATIONS[1]!]);
    await importerProspects(db.pool, [p("alice")], null);
    expect(await etatDe("alice")).toEqual({ statut_relation: "en_relation", etape: "connecte", journal: ["changement_etape@2024-03-01"] });
  });

  it("réimporter les relations ne duplique rien ; une invitation en attente reste en attente", async () => {
    await semer();
    await importerRelations(db.pool, [RELATIONS[1]!]);
    expect(await etatDe("bruno")).toMatchObject({ statut_relation: "en_attente", etape: "invitation_envoyee" });
    await importerRelations(db.pool, RELATIONS);
    const r = await importerRelations(db.pool, RELATIONS);
    expect(r.etapesAvancees).toBe(0);
    expect((await etatDe("bruno")).journal).toEqual(["acceptation@2026-11-05", "changement_etape@2026-11-05"]);
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
    await semer();
    const intrus = await asUser(db.pool, "intrus@example.com", (c) => c.query("select details from public.prospects"));
    expect(intrus.rows).toEqual([]);
    await expect(asUser(db.pool, null, (c) => c.query("select details from public.prospects"))).rejects.toThrow(/permission denied/);
  });
});
