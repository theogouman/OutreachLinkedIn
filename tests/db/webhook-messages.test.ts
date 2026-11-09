import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { traiterWebhookUnipile } from "@/server/webhooks/unipile";
import { rattacherConversations } from "@/server/conversations";
import { envoyerPush, notifier } from "@/server/notifications";

const SECRET = "secret-webhook-de-test";
const T = 1_793_980_800;
const signer = (corps: string) => `t=${T},v0=${createHmac("sha256", SECRET).update(`${T}.${corps}`).digest("hex")}`;
let n = 0;
const evenement = (type: string, payload: unknown) =>
  JSON.stringify({ id: `evt_${++n}`, type, account_id: "acc_moi", created_at: "2026-11-09T10:00:00Z", payload });
const message = (extra: Record<string, unknown>) => ({
  object: "Message",
  id: `msg_${++n}`,
  chat_id: "chat_lea",
  text: "Bonjour, avec plaisir",
  timestamp: "2026-11-09T09:30:00Z",
  is_sender: false,
  sender_id: "ACoLEA",
  sender: { id: "ACoLEA", display_name: "Léa Martin", type: "user" },
  attachments: [],
  ...extra,
});

describe.skipIf(!TEST_DATABASE_URL)("webhooks Unipile : messages et alertes", () => {
  let db: TestDb;
  const pushes: string[] = [];
  const envoyerFactice = async (_a: unknown, charge: string) => {
    pushes.push(charge);
  };
  const recevoir = (corps: string, deps = {}) =>
    traiterWebhookUnipile(db.pool, corps, signer(corps), {
      secret: SECRET,
      accountId: "acc_moi",
      maintenantMs: T * 1000,
      deps: { envoyerPush: envoyerFactice, ...deps },
    });

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query(
      "truncate public.actions, public.messages, public.conversations, public.prospects, public.webhook_events, public.notifications, public.abonnements_push cascade",
    );
    pushes.length = 0;
  });

  async function lea(etape = "premier_message", providerId: string | null = "ACoLEA") {
    const r = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, provider_id, statut_relation, etape, prenom)
       values ('https://www.linkedin.com/in/lea', 'linkedin.com/in/lea', $1, 'en_relation', $2, 'Léa') returning id`,
      [providerId, etape],
    );
    return r.rows[0].id as string;
  }

  it("message reçu d'un prospect : rejoint sa conversation d'archive, non lue, étape « Répondu »", async () => {
    const id = await lea();
    const arch = await db.pool.query(
      "insert into public.conversations (linkedin_conversation_id, prospect_id, dernier_message_at) values ('2-arch', $1, '2026-11-02') returning id",
      [id],
    );
    expect((await recevoir(evenement("message.new", message({})))).status).toBe(200);
    const c = await db.pool.query("select id, unipile_chat_id, non_lu from public.conversations");
    expect(c.rows).toEqual([{ id: arch.rows[0].id, unipile_chat_id: "chat_lea", non_lu: true }]);
    const m = await db.pool.query("select sens, texte from public.messages");
    expect(m.rows).toEqual([{ sens: "entrant", texte: "Bonjour, avec plaisir" }]);
    const p = await db.pool.query("select etape from public.prospects where id = $1", [id]);
    expect(p.rows[0].etape).toBe("repondu");
    const a = await db.pool.query("select type from public.actions order by type");
    expect(a.rows.map((r) => r.type)).toEqual(["changement_etape", "reponse"]);
  });

  it("le même message reçu deux fois (ou déjà envoyé depuis l'outil) n'est pas dupliqué", async () => {
    await lea();
    const msg = message({ id: "msg_fixe" });
    await recevoir(evenement("message.new", msg));
    await recevoir(evenement("message.new", msg));
    expect((await db.pool.query("select count(*)::int n from public.messages")).rows[0].n).toBe(1);
  });

  it("message envoyé depuis le téléphone dans un nouveau chat : interlocuteur lu chez Unipile", async () => {
    const id = await lea("connecte");
    const vus: string[] = [];
    await recevoir(evenement("message.new", message({ chat_id: "chat_neuf", is_sender: true, sender_id: "ACoMOI" })), {
      lireInterlocuteur: async (chat: string) => (vus.push(chat), "ACoLEA"),
    });
    expect(vus).toEqual(["chat_neuf"]);
    const c = await db.pool.query("select prospect_id, non_lu from public.conversations where unipile_chat_id = 'chat_neuf'");
    expect(c.rows).toEqual([{ prospect_id: id, non_lu: false }]);
    // Un message sortant ne fait pas avancer l'étape.
    expect((await db.pool.query("select etape from public.prospects where id = $1", [id])).rows[0].etape).toBe("connecte");
  });

  it("interlocuteur inconnu : conversation hors CRM, rattachée (et fusionnée) dès que le prospect est identifié", async () => {
    const id = await lea("premier_message", null);
    await db.pool.query(
      "insert into public.conversations (linkedin_conversation_id, prospect_id, dernier_message_at) values ('2-arch', $1, '2026-11-02')",
      [id],
    );
    await recevoir(evenement("message.new", message({})));
    const hors = await db.pool.query("select prospect_id, interlocuteur_nom from public.conversations where unipile_chat_id = 'chat_lea'");
    expect(hors.rows).toEqual([{ prospect_id: null, interlocuteur_nom: "Léa Martin" }]);

    const c = await db.pool.connect();
    try {
      await rattacherConversations(c, id, "ACoLEA");
    } finally {
      c.release();
    }
    const apres = await db.pool.query("select linkedin_conversation_id, unipile_chat_id, prospect_id from public.conversations");
    expect(apres.rows).toEqual([{ linkedin_conversation_id: "2-arch", unipile_chat_id: "chat_lea", prospect_id: id }]);
    expect((await db.pool.query("select count(*)::int n from public.messages")).rows[0].n).toBe(1);
  });

  it("message modifié puis supprimé", async () => {
    await lea();
    await recevoir(evenement("message.new", message({ id: "msg_m" })));
    await recevoir(evenement("message.update", { ...message({ id: "msg_m" }), text: "Texte corrigé" }));
    expect((await db.pool.query("select texte from public.messages")).rows[0].texte).toBe("Texte corrigé");
    await recevoir(evenement("message.delete", { chat_id: "chat_lea", id: "msg_m" }));
    expect((await db.pool.query("select count(*)::int n from public.messages")).rows[0].n).toBe(0);
  });

  it("événements sans effet (lecture, réaction, abonné) acceptés ; message d'événement ignoré", async () => {
    await lea();
    expect((await recevoir(evenement("message.receipt.read", { chat_id: "chat_lea", message_id: "x" }))).status).toBe(200);
    expect((await recevoir(evenement("follower.new", {}))).status).toBe(200);
    await recevoir(evenement("message.new", message({ is_event: true })));
    expect((await db.pool.query("select count(*)::int n from public.messages")).rows[0].n).toBe(0);
  });

  it("compte déconnecté : notification d'alerte, poussée aux appareils abonnés", async () => {
    await db.pool.query(
      "insert into public.abonnements_push (endpoint, p256dh, auth) values ('https://push.example.test/abc', 'BNcRd', 'tBHI')",
    );
    expect((await recevoir(evenement("account.status.disconnected", { timestamp: "2026-11-09T10:00:00Z" }))).status).toBe(200);
    const nfs = await db.pool.query("select type, niveau, lien, lue from public.notifications");
    expect(nfs.rows).toEqual([{ type: "compte_deconnecte", niveau: "alerte", lien: "/reglages", lue: false }]);
    expect(pushes).toHaveLength(1);
    expect(JSON.parse(pushes[0]!)).toMatchObject({ titre: "Compte LinkedIn déconnecté", lien: "/reglages" });
  });

  it("Push : un abonnement expiré (410) est supprimé, les clés sont créées une fois", async () => {
    await db.pool.query("insert into public.abonnements_push (endpoint, p256dh, auth) values ('https://push.example.test/vieux', 'a', 'b')");
    const r = await envoyerPush(db.pool, { titre: "t", corps: null, lien: null }, async () => {
      throw Object.assign(new Error("Gone"), { statusCode: 410 });
    });
    expect(r.envoyes).toBe(0);
    expect((await db.pool.query("select count(*)::int n from public.abonnements_push")).rows[0].n).toBe(0);
    expect((await db.pool.query("select count(*)::int n from private.cles_push")).rows[0].n).toBe(1);
    await notifier(db.pool, { type: "test", niveau: "info", titre: "x" });
    expect((await db.pool.query("select count(*)::int n from private.cles_push")).rows[0].n).toBe(1);
  });

  it("refuse un lien externe dans une notification", async () => {
    await expect(notifier(db.pool, { type: "test", niveau: "info", titre: "x", lien: "https://evil.example" })).rejects.toThrow();
    await expect(notifier(db.pool, { type: "test", niveau: "info", titre: "x", lien: "//evil.example" })).rejects.toThrow();
  });

  it("accusé de lecture : nos messages envoyés jusqu'au message lu sont marqués lus", async () => {
    await lea();
    await recevoir(evenement("message.new", message({ id: "m1", is_sender: true, sender_id: "ACoMOI", timestamp: "2026-11-09T09:00:00Z" })), {
      lireInterlocuteur: async () => "ACoLEA",
    });
    await recevoir(evenement("message.new", message({ id: "m2", is_sender: true, sender_id: "ACoMOI", timestamp: "2026-11-09T09:05:00Z" })));
    await recevoir(evenement("message.new", message({ id: "m3", is_sender: true, sender_id: "ACoMOI", timestamp: "2026-11-09T09:10:00Z" })));
    await recevoir(
      evenement("message.receipt.read", { chat_id: "chat_lea", message_id: "m2", user_id: "ACoLEA", timestamp: "2026-11-09T09:20:00Z" }),
    );
    const r = await db.pool.query("select unipile_message_id, lu_le from public.messages order by envoye_at");
    expect(r.rows.map((x) => [x.unipile_message_id, x.lu_le?.toISOString() ?? null])).toEqual([
      ["m1", "2026-11-09T09:20:00.000Z"],
      ["m2", "2026-11-09T09:20:00.000Z"],
      ["m3", null],
    ]);
  });

  it("accusé de lecture ignoré quand c'est nous qui lisons", async () => {
    await lea();
    await recevoir(evenement("message.new", message({ id: "s1", is_sender: true, sender_id: "ACoMOI", timestamp: "2026-11-09T09:00:00Z" })), {
      lireInterlocuteur: async () => "ACoLEA",
    });
    await recevoir(evenement("message.new", message({ id: "e1", timestamp: "2026-11-09T09:05:00Z" })));
    await recevoir(evenement("message.receipt.read", { chat_id: "chat_lea", message_id: "e1", user_id: "ACoMOI", timestamp: "2026-11-09T09:30:00Z" }));
    await recevoir(evenement("message.receipt.read", { chat_id: "chat_lea", user_id: "ACoAUTRE", timestamp: "2026-11-09T09:30:00Z" }));
    expect((await db.pool.query("select count(*)::int n from public.messages where lu_le is not null")).rows[0].n).toBe(0);
  });
});
