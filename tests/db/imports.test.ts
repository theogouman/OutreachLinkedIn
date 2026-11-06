import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { importerProspects, importerRelations } from "@/server/import/appliquer";
import type { ProspectCsv } from "@/server/import/prospects-csv";

const p = (id: string, extra: Partial<ProspectCsv> = {}): ProspectCsv => ({
  linkedinUrl: `https://www.linkedin.com/in/${id}`,
  urlNormalisee: `linkedin.com/in/${id}`,
  publicIdentifier: id,
  prenom: "P",
  nom: id,
  poste: null,
  entreprise: null,
  ...extra,
});

describe.skipIf(!TEST_DATABASE_URL)("imports", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());

  it("importe les prospects, crée une lecture de profil par nouveau prospect, sans doublon", async () => {
    const r1 = await importerProspects(db.pool, [p("alice"), p("bruno")], "Salon 2026");
    expect(r1).toEqual({ crees: 2, dejaPresents: 0, lecturesEnFile: 2 });
    const r2 = await importerProspects(db.pool, [p("alice", { nom: "Modifié" }), p("chloe")], "Autre");
    expect(r2).toEqual({ crees: 1, dejaPresents: 1, lecturesEnFile: 1 });

    const alice = await db.pool.query("select nom, liste_origine from public.prospects where url_normalisee = 'linkedin.com/in/alice'");
    expect(alice.rows[0]).toEqual({ nom: "alice", liste_origine: "Salon 2026" });

    const taches = await db.pool.query(
      "select type_action, statut, payload from public.taches order by ordre",
    );
    expect(taches.rows).toEqual([
      { type_action: "lecture_profil", statut: "en_attente", payload: { public_identifier: "alice" } },
      { type_action: "lecture_profil", statut: "en_attente", payload: { public_identifier: "bruno" } },
      { type_action: "lecture_profil", statut: "en_attente", payload: { public_identifier: "chloe" } },
    ]);
    // Aucun appel LinkedIn à l'import : rien dans le journal.
    expect((await db.pool.query("select count(*)::int as n from public.actions")).rows[0].n).toBe(0);
  });

  it("l'archive des relations met à jour les statuts, avant ou après l'import des prospects", async () => {
    await importerRelations(db.pool, [{ urlNormalisee: "linkedin.com/in/bruno", date: new Date("2024-03-01T00:00:00Z") }, { urlNormalisee: "linkedin.com/in/zoe", date: null }]);
    await importerProspects(db.pool, [p("zoe")], null);
    const r = await db.pool.query(
      "select url_normalisee, statut_relation from public.prospects where url_normalisee in ('linkedin.com/in/bruno', 'linkedin.com/in/zoe') order by 1",
    );
    expect(r.rows).toEqual([
      { url_normalisee: "linkedin.com/in/bruno", statut_relation: "en_relation" },
      { url_normalisee: "linkedin.com/in/zoe", statut_relation: "en_relation" },
    ]);
    const runs = await db.pool.query("select type, statut from public.sync_runs order by debut");
    expect(runs.rows.every((x) => x.statut === "succes")).toBe(true);
  });
});
