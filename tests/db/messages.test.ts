import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur } from "@/server/unipile/executeur";
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
      executeur: creerExecuteur(creerClientSimule()),
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
});
