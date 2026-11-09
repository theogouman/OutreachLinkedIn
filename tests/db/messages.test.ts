import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis } from "@/server/unipile/executeur";
import { creerClientSimule } from "@/server/unipile/simule";
import { EnvoiRefuse, mettreMessageEnFile } from "@/server/mutations";
import { filDepuis } from "@/server/donnees";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("rédaction et envoi de messages par la file", () => {
  let db: TestDb;
  let convDemo: string;
  let convReelle: string;

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.messages, public.conversations, public.prospects cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, demo) values ('linkedin.com/in/demo-a', 'linkedin.com/in/demo-a', 'Camille', 'Durand', true) returning id",
    );
    convDemo = (
      await db.pool.query(
        "insert into public.conversations (unipile_chat_id, prospect_id, demo, dernier_message_at) values ('demo-chat-a', $1, true, '2026-11-01') returning id",
        [p.rows[0].id],
      )
    ).rows[0].id;
    convReelle = (
      await db.pool.query("insert into public.conversations (unipile_chat_id, interlocuteur_nom) values ('chat-reel-1', 'Inconnu') returning id")
    ).rows[0].id;
  });

  const tour = () =>
    executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(creerClientSimule(), { lireDestinataire: lireDestinataireDepuis(db.pool) }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
      seulementDemo: true,
    });

  it("met le message en file une seule fois, même si l'envoi est cliqué deux fois", async () => {
    const cle = randomUUID();
    const a = await mettreMessageEnFile(db.pool, { conversationId: convDemo, texte: "  Bonjour Camille  ", cle }, { modeSimule: true });
    const b = await mettreMessageEnFile(db.pool, { conversationId: convDemo, texte: "Bonjour Camille", cle }, { modeSimule: true });
    expect(b.tacheId).toBe(a.tacheId);
    const t = await db.pool.query("select type_action, payload, prospect_id is not null as avec_prospect from public.taches");
    expect(t.rowCount).toBe(1);
    expect(t.rows[0]).toMatchObject({ type_action: "message", avec_prospect: true });
    expect(t.rows[0].payload).toMatchObject({ conversation_id: convDemo, chat_id: "demo-chat-a", texte: "Bonjour Camille" });
  });

  it("refuse un texte vide, trop long, ou une conversation inconnue", async () => {
    const base = { conversationId: convDemo, cle: randomUUID() };
    await expect(mettreMessageEnFile(db.pool, { ...base, texte: "   " }, { modeSimule: true })).rejects.toThrow();
    await expect(mettreMessageEnFile(db.pool, { ...base, texte: "x".repeat(8001) }, { modeSimule: true })).rejects.toThrow();
    await expect(mettreMessageEnFile(db.pool, { ...base, conversationId: "pas-un-uuid", texte: "ok" }, { modeSimule: true })).rejects.toThrow();
    await expect(mettreMessageEnFile(db.pool, { ...base, conversationId: randomUUID(), texte: "ok" }, { modeSimule: true })).rejects.toThrow(EnvoiRefuse);
  });

  it("tant qu'Unipile n'est pas branché, une vraie conversation ne reçoit rien", async () => {
    await expect(
      mettreMessageEnFile(db.pool, { conversationId: convReelle, texte: "Bonjour", cle: randomUUID() }, { modeSimule: true }),
    ).rejects.toThrow(EnvoiRefuse);
    // Branché (mode réel), la même demande est acceptée et attend son tour dans la file.
    const r = await mettreMessageEnFile(db.pool, { conversationId: convReelle, texte: "Bonjour", cle: randomUUID() }, { modeSimule: false });
    expect(r.tacheId).toBeTruthy();
  });

  it("le moteur envoie le message : il apparaît dans le fil, d'abord en file puis envoyé", async () => {
    await mettreMessageEnFile(db.pool, { conversationId: convDemo, texte: "Bonjour Camille", cle: randomUUID() }, { modeSimule: true });
    // Le test simule un jeudi passé : la tâche doit être exécutable à cette date.
    await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
    const avant = await filDepuis(db.pool, { conversationId: convDemo });
    expect(avant?.messages.at(-1)).toMatchObject({ sens: "sortant", texte: "Bonjour Camille", statut: "en_file" });

    expect(await tour()).toMatchObject({ resultat: "succes" });

    const apres = await filDepuis(db.pool, { conversationId: convDemo });
    expect(apres?.messages).toHaveLength(1);
    expect(apres?.messages[0]).toMatchObject({ sens: "sortant", texte: "Bonjour Camille", statut: "envoye" });
    const c = await db.pool.query("select dernier_message_at from public.conversations where id = $1", [convDemo]);
    expect(new Date(c.rows[0].dernier_message_at).getTime()).toBe(JEUDI_10H.getTime());
    const a = await db.pool.query("select type, resultat from public.actions");
    expect(a.rows).toEqual([{ type: "message", resultat: "succes" }]);
  });

  it("le client simulé refuse d'envoyer vers une conversation qui n'est pas fictive", async () => {
    const r = await creerClientSimule().envoyerMessage("chat-reel-1", "Bonjour");
    expect(r.ok).toBe(false);
  });

  describe("premier message (démarrer une conversation)", () => {
    /** Prospect de démo sans conversation, au statut de relation donné. */
    async function prospect(statut: string, opts: { demo?: boolean; providerId?: string | null } = {}) {
      const id = `demo-p${randomUUID().slice(0, 8)}`;
      const r = await db.pool.query(
        `insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, demo, statut_relation, provider_id)
         values ($1, $1, 'Léa', 'Martin', $2, $3, $4) returning id`,
        [`linkedin.com/in/${id}`, opts.demo ?? true, statut, opts.providerId === undefined ? `ACoDEMO${id.slice(5)}` : opts.providerId],
      );
      return r.rows[0].id as string;
    }
    const envoyer = (prospectId: string, modeSimule = true) =>
      mettreMessageEnFile(db.pool, { prospectId, texte: "Bonjour Léa", cle: randomUUID() }, { modeSimule });

    it("refuse d'écrire à quelqu'un qui n'est pas une relation de 1er degré", async () => {
      for (const statut of ["a_inviter", "en_attente", "invitation_recue"]) {
        await expect(envoyer(await prospect(statut), false)).rejects.toThrow(/1er degré/);
      }
      expect((await db.pool.query("select count(*)::int n from public.taches")).rows[0].n).toBe(0);
    });

    it("tant qu'Unipile n'est pas branché, un vrai prospect ne reçoit rien", async () => {
      await expect(envoyer(await prospect("en_relation", { demo: false }))).rejects.toThrow(EnvoiRefuse);
    });

    it("refuse un prospect inconnu, ou une demande qui vise à la fois conversation et prospect", async () => {
      await expect(envoyer(randomUUID())).rejects.toThrow(EnvoiRefuse);
      await expect(
        mettreMessageEnFile(db.pool, { prospectId: randomUUID(), conversationId: convDemo, texte: "x", cle: randomUUID() }, { modeSimule: true }),
      ).rejects.toThrow();
    });

    it("démarre la conversation par la file : elle est créée, rattachée au prospect, avec le message", async () => {
      const id = await prospect("en_relation");
      await envoyer(id);
      await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
      const avant = await filDepuis(db.pool, { prospectId: id });
      expect(avant).toMatchObject({ id: null, prospectId: id });
      expect(avant?.messages).toEqual([expect.objectContaining({ texte: "Bonjour Léa", statut: "en_file" })]);

      expect(await tour()).toMatchObject({ resultat: "succes" });

      const apres = await filDepuis(db.pool, { prospectId: id });
      expect(apres?.id).toBeTruthy();
      expect(apres?.messages).toEqual([expect.objectContaining({ sens: "sortant", texte: "Bonjour Léa", statut: "envoye" })]);
      const c = await db.pool.query("select unipile_chat_id, demo from public.conversations where prospect_id = $1", [id]);
      expect(c.rows).toEqual([{ unipile_chat_id: expect.stringMatching(/^demo-chat-/), demo: true }]);
      const a = await db.pool.query("select type, resultat from public.actions");
      expect(a.rows).toEqual([{ type: "message", resultat: "succes" }]);
    });

    it("un second premier message rejoint la conversation créée par le premier", async () => {
      const id = await prospect("en_relation");
      await envoyer(id);
      await envoyer(id);
      await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
      await tour();
      await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
      expect(await tour()).toMatchObject({ resultat: "succes" });
      const c = await db.pool.query("select count(*)::int n from public.conversations where prospect_id = $1", [id]);
      expect(c.rows[0].n).toBe(1);
      expect((await filDepuis(db.pool, { prospectId: id }))?.messages).toHaveLength(2);
    });

    it("la relation est revérifiée à l'envoi : si elle a disparu, rien ne part", async () => {
      const id = await prospect("en_relation");
      await envoyer(id);
      await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
      await db.pool.query("update public.prospects set statut_relation = 'a_inviter' where id = $1", [id]);
      expect(await tour()).toMatchObject({ resultat: "echec" });
      const t = await db.pool.query("select statut, derniere_erreur from public.taches");
      expect(t.rows[0].statut).toBe("echec");
      expect((await db.pool.query("select count(*)::int n from public.conversations where prospect_id = $1", [id])).rows[0].n).toBe(0);
    });

    it("avec une conversation existante, la demande par prospect y écrit directement", async () => {
      const p = await db.pool.query("select prospect_id from public.conversations where id = $1", [convDemo]);
      const r = await envoyer(p.rows[0].prospect_id);
      const t = await db.pool.query("select payload from public.taches where id = $1", [r.tacheId]);
      expect(t.rows[0].payload).toMatchObject({ conversation_id: convDemo, chat_id: "demo-chat-a" });
    });

    it("le client simulé ne démarre de conversation qu'avec un prospect fictif", async () => {
      expect((await creerClientSimule().demarrerConversation("ACoAAReel123", "Bonjour")).ok).toBe(false);
    });

    it("conversation reprise de l'archive (sans chat Unipile) : le message la relie au chat démarré, sans doublon", async () => {
      const id = await prospect("en_relation");
      const arch = await db.pool.query(
        `insert into public.conversations (linkedin_conversation_id, prospect_id, dernier_message_at, demo)
         values ('2-archive', $1, '2026-10-29', true) returning id`,
        [id],
      );
      await db.pool.query(
        "insert into public.messages (conversation_id, sens, texte, envoye_at) values ($1, 'sortant', 'Ancien message', '2026-10-29')",
        [arch.rows[0].id],
      );
      const r = await mettreMessageEnFile(db.pool, { conversationId: arch.rows[0].id, texte: "Relance", cle: randomUUID() }, { modeSimule: true });
      const t = await db.pool.query("select payload from public.taches where id = $1", [r.tacheId]);
      expect(t.rows[0].payload).toEqual({ prospect_id: id, texte: "Relance" });
      await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
      expect(await tour()).toMatchObject({ resultat: "succes" });
      const c = await db.pool.query("select id, unipile_chat_id, linkedin_conversation_id from public.conversations where prospect_id = $1", [id]);
      expect(c.rows).toEqual([{ id: arch.rows[0].id, unipile_chat_id: expect.stringMatching(/^demo-chat-/), linkedin_conversation_id: "2-archive" }]);
      expect((await filDepuis(db.pool, { prospectId: id }))?.messages.map((m) => m.texte)).toEqual(["Ancien message", "Relance"]);
    });

    it("conversation de l'archive sans prospect : réponse refusée (à faire depuis LinkedIn)", async () => {
      const arch = await db.pool.query("insert into public.conversations (linkedin_conversation_id, demo) values ('2-hors-crm', true) returning id");
      await expect(
        mettreMessageEnFile(db.pool, { conversationId: arch.rows[0].id, texte: "x", cle: randomUUID() }, { modeSimule: true }),
      ).rejects.toThrow(/LinkedIn/);
    });

    it("une conversation doit avoir au moins un identifiant", async () => {
      await expect(db.pool.query("insert into public.conversations (demo) values (true)")).rejects.toThrow(/conversations_identifiant/);
    });
  });
});
