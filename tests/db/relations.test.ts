import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations } from "@/server/relations";

describe.skipIf(!TEST_DATABASE_URL)("statuts de relation en base", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.prospects, public.liens_linkedin cascade");
  });

  async function prospect(id: string, extra: { providerId?: string; etape?: string; statut?: string } = {}) {
    const r = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, provider_id, etape, statut_relation)
       values ($1, $2, $3, $4, $5) returning id`,
      [`https://linkedin.com/in/${id}`, `linkedin.com/in/${id}`, extra.providerId ?? null, extra.etape ?? "a_contacter", extra.statut ?? "a_inviter"],
    );
    return r.rows[0].id as string;
  }
  const statut = async (id: string) =>
    (await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [id])).rows[0];

  it("applique la priorité relation > envoyée > reçue > à inviter", async () => {
    const a = await prospect("a");
    const b = await prospect("b");
    const c = await prospect("c");
    const d = await prospect("d");
    const client = await db.pool.connect();
    try {
      await enregistrerLiens(client, [
        { type: "invitation_envoyee", urlNormalisee: "linkedin.com/in/a" },
        { type: "relation", urlNormalisee: "linkedin.com/in/a" },
        { type: "invitation_envoyee", urlNormalisee: "linkedin.com/in/b" },
        { type: "invitation_recue", urlNormalisee: "linkedin.com/in/b" },
        { type: "invitation_recue", urlNormalisee: "linkedin.com/in/c" },
      ], "csv");
      const transitions = await recalculerStatuts(client);
      expect(transitions).toHaveLength(3);
    } finally {
      client.release();
    }
    expect((await statut(a)).statut_relation).toBe("en_relation");
    expect((await statut(b)).statut_relation).toBe("en_attente");
    expect((await statut(c)).statut_relation).toBe("invitation_recue");
    expect((await statut(d)).statut_relation).toBe("a_inviter");
  });

  it("rapproche aussi par provider_id", async () => {
    const p = await prospect("ancien-slug", { providerId: "ACoAAA1" });
    const client = await db.pool.connect();
    try {
      await enregistrerLiens(client, [{ type: "relation", urlNormalisee: "linkedin.com/in/nouveau-slug", providerId: "ACoAAA1" }], "sync");
      await recalculerStatuts(client, { providerIds: ["ACoAAA1"] });
    } finally {
      client.release();
    }
    expect((await statut(p)).statut_relation).toBe("en_relation");
  });

  it("un même lien enregistré deux fois ne crée pas de doublon", async () => {
    const client = await db.pool.connect();
    try {
      const l = { type: "relation" as const, urlNormalisee: "linkedin.com/in/x", date: new Date("2025-01-01T00:00:00Z") };
      await enregistrerLiens(client, [l], "csv");
      await enregistrerLiens(client, [{ ...l, providerId: "ACoX" }], "sync");
    } finally {
      client.release();
    }
    const r = await db.pool.query("select provider_id, date_lien from public.liens_linkedin");
    expect(r.rows).toEqual([{ provider_id: "ACoX", date_lien: new Date("2025-01-01T00:00:00Z") }]);
  });

  it("invitation acceptée : étape « Connecté » et événement au journal, hors quotas", async () => {
    const p = await prospect("e", { statut: "en_attente", etape: "invitation_envoyee" });
    const loin = await prospect("f", { statut: "en_attente", etape: "repondu" });
    const client = await db.pool.connect();
    try {
      await enregistrerLiens(client, [
        { type: "relation", urlNormalisee: "linkedin.com/in/e" },
        { type: "relation", urlNormalisee: "linkedin.com/in/f" },
      ], "webhook");
      const t = await recalculerStatuts(client, { urls: ["linkedin.com/in/e", "linkedin.com/in/f"] });
      expect(await traiterAcceptations(client, t)).toBe(2);
    } finally {
      client.release();
    }
    expect(await statut(p)).toEqual({ statut_relation: "en_relation", etape: "connecte" });
    // Un prospect déjà plus loin dans le pipeline ne recule pas.
    expect((await statut(loin)).etape).toBe("repondu");
    const act = await db.pool.query("select type, sortante from public.actions where prospect_id = $1 order by type", [p]);
    expect(act.rows).toEqual([
      { type: "acceptation", sortante: false },
      { type: "changement_etape", sortante: false },
    ]);
  });

  it("un import CSV initial ne compte pas comme acceptation", async () => {
    await prospect("g");
    const client = await db.pool.connect();
    try {
      await enregistrerLiens(client, [{ type: "relation", urlNormalisee: "linkedin.com/in/g" }], "csv");
      const t = await recalculerStatuts(client);
      expect(await traiterAcceptations(client, t)).toBe(0);
    } finally {
      client.release();
    }
  });
});
