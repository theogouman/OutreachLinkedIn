import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { traiterWebhookUnipile } from "@/server/webhooks/unipile";

const SECRET = "secret-webhook-de-test";
const T = 1_793_980_800;
const OPTS = { secret: SECRET, accountId: "acc_moi", maintenantMs: T * 1000 };
const signer = (corps: string) => `t=${T},v0=${createHmac("sha256", SECRET).update(`${T}.${corps}`).digest("hex")}`;

const relationNew = (id: string, accountId = "acc_moi") =>
  JSON.stringify({
    id,
    type: "relation.new",
    account_id: accountId,
    created_at: "2026-11-06T10:00:00Z",
    payload: { id: "rel_1", object: "UserRelation", user: { id: "ACoEVA", public_identifier: "eva", display_name: "Eva" } },
  });

describe.skipIf(!TEST_DATABASE_URL)("webhook Unipile", () => {
  let db: TestDb;
  let prospectId: string;
  beforeAll(async () => {
    db = await createTestDb();
    const r = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, statut_relation, etape) values ('https://linkedin.com/in/eva', 'linkedin.com/in/eva', 'en_attente', 'invitation_envoyee') returning id",
    );
    prospectId = r.rows[0].id;
  });
  afterAll(async () => db?.drop());

  it("rejette un webhook non signé ou mal signé, sans rien écrire", async () => {
    const corps = relationNew("evt_x");
    expect((await traiterWebhookUnipile(db.pool, corps, null, OPTS)).status).toBe(401);
    expect((await traiterWebhookUnipile(db.pool, corps, signer('{"autre":1}'), OPTS)).status).toBe(401);
    const n = await db.pool.query("select count(*)::int as n from public.webhook_events");
    expect(n.rows[0].n).toBe(0);
  });

  it("relation.new : invitation acceptée → « En relation », étape « Connecté »", async () => {
    const corps = relationNew("evt_1");
    expect(await traiterWebhookUnipile(db.pool, corps, signer(corps), OPTS)).toEqual({ status: 200, corps: { ok: true } });
    const p = await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [prospectId]);
    expect(p.rows[0]).toEqual({ statut_relation: "en_relation", etape: "connecte" });
  });

  it("un même événement reçu deux fois n'a qu'un effet", async () => {
    const corps = relationNew("evt_1");
    expect((await traiterWebhookUnipile(db.pool, corps, signer(corps), OPTS)).corps).toEqual({ ok: true, doublon: true });
    const a = await db.pool.query("select count(*)::int as n from public.actions where type = 'acceptation'");
    expect(a.rows[0].n).toBe(1);
  });

  it("ignore un événement d'un autre compte Unipile", async () => {
    const corps = relationNew("evt_2", "acc_autre");
    expect((await traiterWebhookUnipile(db.pool, corps, signer(corps), OPTS)).status).toBe(200);
    const e = await db.pool.query("select id from public.webhook_events where id = 'evt_2'");
    expect(e.rowCount).toBe(0);
  });

  it("rejette un corps invalide ou trop gros", async () => {
    expect((await traiterWebhookUnipile(db.pool, "pas du json", signer("pas du json"), OPTS)).status).toBe(400);
    const gros = "x".repeat(1024 * 1024 + 1);
    expect((await traiterWebhookUnipile(db.pool, gros, signer(gros), OPTS)).status).toBe(413);
  });
});
