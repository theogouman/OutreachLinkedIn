import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { semerDemo } from "@/server/demo";
import { filDepuis, inboxDepuis } from "@/server/donnees";
import { EnvoiRefuse, marquerLue, marquerNonLue, supprimerConversation } from "@/server/mutations";

const AUTORISE = "theo@example.com";

describe.skipIf(!TEST_DATABASE_URL)("Inbox : marquer non lue, supprimer une conversation", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
    await semerDemo(db.pool, new Date("2026-11-05T09:00:00Z"));
  });
  afterAll(async () => db?.drop());

  const conversations = async () => (await inboxDepuis(db.pool, { page: 1 })).lignes;

  it("marquer non lue : la conversation repasse dans les non lues, une fois", async () => {
    const lue = (await conversations()).find((c) => !c.nonLu)!;
    expect(await marquerNonLue(db.pool, lue.id)).toBe(true);
    expect(await marquerNonLue(db.pool, lue.id)).toBe(false); // déjà non lue
    const nonLues = (await inboxDepuis(db.pool, { page: 1, nonLus: "oui" })).lignes.map((c) => c.id);
    expect(nonLues).toContain(lue.id);
    expect(await marquerLue(db.pool, lue.id)).toBe(true);
  });

  it("marquer non lue : identifiant invalide refusé", async () => {
    await expect(marquerNonLue(db.pool, "pas-un-uuid")).rejects.toThrow();
  });

  it("supprimer : conversation et messages effacés, prospect conservé, suppression mémorisée", async () => {
    const cible = (await conversations()).find((c) => c.prospectId)!;
    const chat = (await db.pool.query("select unipile_chat_id from public.conversations where id = $1", [cible.id])).rows[0].unipile_chat_id;
    await supprimerConversation(db.pool, cible.id);

    expect((await conversations()).map((c) => c.id)).not.toContain(cible.id);
    expect(await filDepuis(db.pool, { conversationId: cible.id })).toBeNull();
    const msgs = await db.pool.query("select count(*)::int as n from public.messages where conversation_id = $1", [cible.id]);
    expect(msgs.rows[0].n).toBe(0);
    const p = await db.pool.query("select 1 from public.prospects where id = $1", [cible.prospectId]);
    expect(p.rowCount).toBe(1);
    if (chat) {
      const t = await db.pool.query("select 1 from public.conversations_supprimees where unipile_chat_id = $1", [chat]);
      expect(t.rowCount).toBe(1);
    }
  });

  it("supprimer : refusé si un message est en file pour cette conversation", async () => {
    const cible = (await conversations())[0]!;
    await db.pool.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
       values ('message', $1, $2, 'test-suppr-' || gen_random_uuid())`,
      [cible.prospectId, { conversation_id: cible.id, texte: "x" }],
    );
    await expect(supprimerConversation(db.pool, cible.id)).rejects.toBeInstanceOf(EnvoiRefuse);
    expect((await conversations()).map((c) => c.id)).toContain(cible.id);
  });

  it("supprimer : conversation inconnue refusée", async () => {
    await expect(supprimerConversation(db.pool, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(EnvoiRefuse);
  });

  it("accès : l'interface ne peut ni supprimer une conversation ni lire les suppressions", async () => {
    const id = (await conversations())[0]!.id;
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("delete from public.conversations where id = $1", [id]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("select * from public.conversations_supprimees"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(db.pool, null, (c) => c.query("update public.conversations set non_lu = true"))).rejects.toThrow(
      /permission denied/,
    );
  });
});
