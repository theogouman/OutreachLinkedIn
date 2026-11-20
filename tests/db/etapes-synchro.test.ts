import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { synchroniserEtapes } from "@/server/etapes";
import { enregistrerMessageRecu } from "@/server/conversations";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis } from "@/server/unipile/executeur";
import { creerClientSimule } from "../fixtures/client-simule";
import { mettreMessageEnFile } from "@/server/mutations";
import { randomUUID } from "node:crypto";

describe.skipIf(!TEST_DATABASE_URL)("étape synchronisée avec les faits (relation, messages)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.messages, public.conversations, public.prospects cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  async function prospect(id: string, statut: string, etape: string, demo = false) {
    const r = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, statut_relation, etape, demo, provider_id)
       values ($1, $1, $2, $3, $4, $5) returning id`,
      [`linkedin.com/in/${id}`, statut, etape, demo, `ACo${id}`],
    );
    return r.rows[0].id as string;
  }
  async function messages(prospectId: string, liste: [sens: "sortant" | "entrant", quand: string][]) {
    const c = await db.pool.query("insert into public.conversations (unipile_chat_id, prospect_id) values ($1, $2) returning id", [
      `chat-${prospectId}`,
      prospectId,
    ]);
    for (const [sens, quand] of liste) {
      await db.pool.query("insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at) values ($1, $2, $3, 'x', $4)", [
        c.rows[0].id,
        randomUUID(),
        sens,
        quand,
      ]);
    }
    return c.rows[0].id as string;
  }
  const etape = async (id: string) => (await db.pool.query("select etape from public.prospects where id = $1", [id])).rows[0].etape;
  async function tout(cause: "synchro" | "relation" = "synchro") {
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      const r = await synchroniserEtapes(c, null, cause);
      await c.query("commit");
      return r;
    } finally {
      c.release();
    }
  }

  it("avance chaque prospect à l'étape que les faits imposent, sans jamais reculer", async () => {
    const relation = await prospect("rel", "en_relation", "a_contacter");
    const attente = await prospect("att", "en_attente", "a_contacter");
    const inviter = await prospect("inv", "a_inviter", "a_contacter");
    const ecrit = await prospect("ecr", "en_relation", "connecte");
    await messages(ecrit, [["sortant", "2026-11-10"]]);
    const repondu = await prospect("rep", "en_relation", "a_contacter");
    await messages(repondu, [["sortant", "2024-01-10"], ["entrant", "2024-01-12"]]);
    const luiSeul = await prospect("lui", "en_relation", "a_contacter");
    await messages(luiSeul, [["entrant", "2026-11-01"]]);
    const rdv = await prospect("rdv", "en_relation", "rdv_fixe");
    await messages(rdv, [["sortant", "2026-11-01"]]);
    const perdu = await prospect("per", "en_attente", "perdu");

    const r = await tout();
    expect(r).toBe(5);
    expect(await etape(relation)).toBe("connecte");
    expect(await etape(attente)).toBe("invitation_envoyee");
    expect(await etape(inviter)).toBe("a_contacter");
    expect(await etape(ecrit)).toBe("premier_message");
    expect(await etape(repondu)).toBe("repondu");
    expect(await etape(luiSeul)).toBe("connecte"); // il a écrit le premier : rien d'envoyé de notre part
    expect(await etape(rdv)).toBe("rdv_fixe");
    expect(await etape(perdu)).toBe("perdu");

    const j = await db.pool.query(
      "select details from public.actions where type = 'changement_etape' and prospect_id = $1",
      [ecrit],
    );
    expect(j.rows).toEqual([{ details: { vers: "premier_message", cause: "synchro" } }]);
    // Une seconde passe ne change plus rien.
    expect(await tout()).toBe(0);
  });

  it("premier message envoyé depuis l'outil : « À contacter » → « Premier message »", async () => {
    const id = await prospect("demo-cam", "en_relation", "connecte", true);
    await db.pool.query("insert into public.conversations (unipile_chat_id, prospect_id, demo) values ('demo-chat-cam', $1, true)", [id]);
    await mettreMessageEnFile(db.pool, { prospectId: id, texte: "Bonjour", cle: randomUUID() }, { modeSimule: false });
    await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
    const bilan = await executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(creerClientSimule(), { lireDestinataire: lireDestinataireDepuis(db.pool) }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => new Date("2026-11-05T09:00:00Z"),
      aleatoire: () => 0,
    });
    expect(bilan).toMatchObject({ resultat: "succes" });
    expect(await etape(id)).toBe("premier_message");
    const j = await db.pool.query("select details from public.actions where type = 'changement_etape' and prospect_id = $1", [id]);
    expect(j.rows).toEqual([{ details: { vers: "premier_message", cause: "message_envoye" } }]);
  });

  it("message envoyé depuis LinkedIn (webhook) : le prospect passe aussi à « Premier message »", async () => {
    const id = await prospect("lea", "en_relation", "a_contacter");
    await db.pool.query("insert into public.conversations (unipile_chat_id, prospect_id) values ('chat-lea', $1)", [id]);
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await enregistrerMessageRecu(c, { id: "m1", chat_id: "chat-lea", text: "Bonjour Léa", timestamp: "2026-11-19T10:00:00Z", is_sender: true });
      await c.query("commit");
    } finally {
      c.release();
    }
    expect(await etape(id)).toBe("premier_message");
  });
});
