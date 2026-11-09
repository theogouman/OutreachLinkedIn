import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { CONVERSATIONS_DEMO, CONVERSATIONS_HORS_CRM_DEMO, purgerDemo, semerDemo } from "@/server/demo";
import { filDepuis, inboxDepuis } from "@/server/donnees";
import { marquerLue } from "@/server/mutations";

const AUTORISE = "theo@example.com";
const TOTAL = Object.keys(CONVERSATIONS_DEMO).length + CONVERSATIONS_HORS_CRM_DEMO.length;

describe.skipIf(!TEST_DATABASE_URL)("Inbox (lecture) et conversations de démo", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
    await semerDemo(db.pool, new Date("2026-11-05T09:00:00Z"));
  });
  afterAll(async () => db?.drop());

  it("la démo crée les conversations, rattachées ou hors CRM", async () => {
    expect((await inboxDepuis(db.pool, { page: 1 })).lignes).toHaveLength(TOTAL);
    const hors = (await inboxDepuis(db.pool, { page: 1, horsCrm: "oui" })).lignes;
    expect(hors.map((c) => c.nom).sort()).toEqual(CONVERSATIONS_HORS_CRM_DEMO.map((h) => h.nom).sort());
    expect(hors.every((c) => c.prospectId === null)).toBe(true);
  });

  it("filtres : non lus, réponses à traiter (dernier message entrant)", async () => {
    const nonLus = (await inboxDepuis(db.pool, { page: 1, nonLus: "oui" })).lignes;
    expect(nonLus.map((c) => c.nom).sort()).toEqual(["Margaux Perrin", "Sophie Dubois"]);
    const aTraiter = (await inboxDepuis(db.pool, { page: 1, aTraiter: "oui" })).lignes;
    expect(aTraiter.every((c) => c.dernierSens === "entrant")).toBe(true);
    expect(aTraiter.map((c) => c.nom)).toContain("Sophie Dubois");
  });

  it("fil d'une conversation, par conversation ou par prospect", async () => {
    const [sophie] = ((await inboxDepuis(db.pool, { page: 1, nonLus: "oui" })).lignes).filter((c) => c.nom === "Sophie Dubois");
    const fil = await filDepuis(db.pool, { conversationId: sophie!.id });
    expect(fil?.messages.map((m) => m.sens)).toEqual(["sortant", "sortant", "entrant"]);
    const parProspect = await filDepuis(db.pool, { prospectId: sophie!.prospectId });
    expect(parProspect?.id).toBe(sophie!.id);
    expect(await filDepuis(db.pool, { conversationId: "pas-un-uuid" })).toBeNull();
    expect(await marquerLue(db.pool, sophie!.id)).toBe(true);
    expect(((await inboxDepuis(db.pool, { page: 1, nonLus: "oui" })).lignes).map((c) => c.nom)).toEqual(["Margaux Perrin"]);
  });

  it("accès : un intrus ne voit rien, l'interface ne peut pas écrire de message", async () => {
    const vu = await asUser(db.pool, "intrus@example.com", (c) => c.query("select * from public.conversations"));
    expect(vu.rowCount).toBe(0);
    await expect(asUser(db.pool, null, (c) => c.query("select * from public.messages"))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db.pool, AUTORISE, (c) =>
        c.query("insert into public.messages (conversation_id, sens, texte, envoye_at) select id, 'sortant', 'x', now() from public.conversations limit 1"),
      ),
    ).rejects.toThrow(/permission denied/);
    const lu = await asUser(db.pool, AUTORISE, (c) => c.query("select count(*)::int as n from public.messages"));
    expect(lu.rows[0].n).toBeGreaterThan(0);
  });

  it("la purge de la démo efface les conversations et leurs messages", async () => {
    await purgerDemo(db.pool);
    const r = await db.pool.query(
      "select (select count(*) from public.conversations)::int as c, (select count(*) from public.messages)::int as m",
    );
    expect(r.rows[0]).toEqual({ c: 0, m: 0 });
  });
});
