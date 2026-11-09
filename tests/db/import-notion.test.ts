import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { importerNotion, importerRelations } from "@/server/import/appliquer";
import { exportNotionSchema, preparerImportNotion } from "@/server/import/notion";
import { ficheProspectDepuis } from "@/server/donnees";

const contact = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nom: `Prénom Nom${id}`,
  prenom: "Prénom",
  role: "CEO",
  linkedin: `https://linkedin.com/in/${id}`,
  statut: "À contacter",
  signal: "Page Notion Publique",
  notes: null,
  requete: "kit presse",
  usageNotion: "Wiki",
  pageNotion: "https://acme.notion.site/Kit",
  entreprise: { nom: "Acme", angle: null, lot: null },
  ...extra,
});

const EXPORT = exportNotionSchema.parse({
  version: 1,
  contacts: [
    contact("alice"),
    contact("bruno", { statut: "Invitation en attente" }),
    contact("chloe", { statut: "Contacté", signal: "LM" }),
    contact("david", { statut: "Exclu" }),
  ],
  logs: [
    { id: "log-1", contactId: "bruno", evenement: "Invitation envoyée", date: "2026-11-04" },
    { id: "log-2", contactId: "chloe", evenement: "Invitation envoyée", date: "2026-10-29" },
    { id: "log-3", contactId: "chloe", evenement: "Message N°1 envoyé", date: "2026-11-03" },
    { id: "log-4", contactId: "david", evenement: "Invitation envoyée", date: "2026-11-02" },
  ],
});

describe.skipIf(!TEST_DATABASE_URL)("import du CRM Notion", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.liens_linkedin, public.prospects, public.sync_runs cascade");
  });

  it("crée les prospects avec étape, liste, informations de liste, liens et actions datées", async () => {
    const r = await importerNotion(db.pool, preparerImportNotion(EXPORT));
    expect(r).toEqual({ crees: 3, dejaPresents: 0, actions: 3 });

    const p = await db.pool.query(
      "select url_normalisee, etape, statut_relation, liste_origine, details from public.prospects order by url_normalisee",
    );
    expect(p.rows).toEqual([
      {
        url_normalisee: "linkedin.com/in/alice",
        etape: "a_contacter",
        statut_relation: "a_inviter",
        liste_origine: "Page Notion Publique",
        details: { pageNotion: "https://acme.notion.site/Kit", requete: "kit presse", usageNotion: "Wiki" },
      },
      {
        url_normalisee: "linkedin.com/in/bruno",
        etape: "invitation_envoyee",
        statut_relation: "en_attente",
        liste_origine: "Page Notion Publique",
        details: { pageNotion: "https://acme.notion.site/Kit", requete: "kit presse", usageNotion: "Wiki" },
      },
      { url_normalisee: "linkedin.com/in/chloe", etape: "premier_message", statut_relation: "en_relation", liste_origine: "LM", details: {} },
    ]);

    const a = await db.pool.query(
      `select p.url_normalisee, a.type, a.sortante, a.resultat, a.created_at, a.details->>'source' as source
         from public.actions a join public.prospects p on p.id = a.prospect_id order by a.created_at`,
    );
    expect(a.rows).toEqual([
      { url_normalisee: "linkedin.com/in/chloe", type: "invitation", sortante: true, resultat: "succes", created_at: new Date("2026-10-29T11:00:00Z"), source: "notion" },
      { url_normalisee: "linkedin.com/in/chloe", type: "message", sortante: true, resultat: "succes", created_at: new Date("2026-11-03T11:00:00Z"), source: "notion" },
      { url_normalisee: "linkedin.com/in/bruno", type: "invitation", sortante: true, resultat: "succes", created_at: new Date("2026-11-04T11:00:00Z"), source: "notion" },
    ]);

    const lectures = await db.pool.query("select count(*)::int as n from public.taches where type_action = 'lecture_profil'");
    expect(lectures.rows[0].n).toBe(3);
  });

  it("se rejoue sans doublon ni modification des prospects existants", async () => {
    await importerNotion(db.pool, preparerImportNotion(EXPORT));
    await db.pool.query("update public.prospects set etape = 'rdv_fixe' where url_normalisee = 'linkedin.com/in/alice'");
    const r = await importerNotion(db.pool, preparerImportNotion(EXPORT));
    expect(r).toEqual({ crees: 0, dejaPresents: 3, actions: 0 });
    const n = await db.pool.query("select (select count(*) from public.actions)::int as a, (select count(*) from public.taches)::int as t");
    expect(n.rows[0]).toEqual({ a: 3, t: 3 });
    const alice = await db.pool.query("select etape from public.prospects where url_normalisee = 'linkedin.com/in/alice'");
    expect(alice.rows[0].etape).toBe("rdv_fixe");
  });

  it("le fichier de relations LinkedIn importé ensuite fait passer une invitation acceptée en relation", async () => {
    await importerNotion(db.pool, preparerImportNotion(EXPORT));
    const r = await importerRelations(db.pool, [{ urlNormalisee: "linkedin.com/in/bruno", date: new Date("2026-11-06T00:00:00Z") }]);
    expect(r.prospectsMisAJour).toBe(1);
    const b = await db.pool.query("select statut_relation from public.prospects where url_normalisee = 'linkedin.com/in/bruno'");
    expect(b.rows[0].statut_relation).toBe("en_relation");
  });

  it("refuse en base des informations de liste qui ne sont pas un objet", async () => {
    await expect(
      db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, details) values ('x', 'linkedin.com/in/xyz', '[1]'::jsonb)",
      ),
    ).rejects.toThrow(/prospects_details_objet/);
  });

  it("ni un visiteur non connecté ni un autre utilisateur ne lisent les informations de liste", async () => {
    await importerNotion(db.pool, preparerImportNotion(EXPORT));
    const intrus = await asUser(db.pool, "intrus@example.com", (c) => c.query("select details from public.prospects"));
    expect(intrus.rows).toEqual([]);
    await expect(asUser(db.pool, null, (c) => c.query("select details from public.prospects"))).rejects.toThrow(/permission denied/);
  });
  it("la fiche n'affiche que les informations de la liste du prospect", async () => {
    await importerNotion(db.pool, preparerImportNotion(EXPORT));
    const ids = await db.pool.query("select url_normalisee, id from public.prospects");
    const id = Object.fromEntries(ids.rows.map((r) => [r.url_normalisee, r.id]));
    const bruno = await ficheProspectDepuis(db.pool, id["linkedin.com/in/bruno"]);
    expect(bruno?.informationsListe.map((i) => i.libelle)).toEqual(["Page Notion", "Requête", "Usage Notion"]);
    const chloe = await ficheProspectDepuis(db.pool, id["linkedin.com/in/chloe"]);
    expect(chloe?.informationsListe).toEqual([]);
  });
});
