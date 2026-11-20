import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { texteCopieDepuis } from "@/server/copie";

describe.skipIf(!TEST_DATABASE_URL)("Inbox : copier le profil et / ou la conversation", () => {
  let db: TestDb;
  let conv: string;
  let horsCrm: string;
  beforeAll(async () => {
    db = await createTestDb();
    const p = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, prenom, nom, poste, entreprise, liste_origine, etape)
       values ('https://www.linkedin.com/in/camille-roux', 'linkedin.com/in/camille-roux', 'camille-roux', 'Camille', 'Roux',
               'Head of Ops', 'Acme', 'Signal Notion', 'premier_message') returning id`,
    );
    await db.pool.query("insert into public.profils_linkedin (prospect_id, source, lu_le, titre, localisation) values ($1, 'apify', now(), 'Ops chez Acme', 'Lyon, France')", [
      p.rows[0].id,
    ]);
    conv = (
      await db.pool.query("insert into public.conversations (unipile_chat_id, prospect_id) values ('chat-1', $1) returning id", [p.rows[0].id])
    ).rows[0].id;
    await db.pool.query(
      `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at) values
         ($1, 'm1', 'sortant', 'Bonjour Camille', '2026-11-18T09:05:00Z'),
         ($1, 'm2', 'entrant', 'Bonjour ! Avec plaisir.', '2026-11-18T10:30:00Z')`,
      [conv],
    );
    horsCrm = (
      await db.pool.query(
        "insert into public.conversations (unipile_chat_id, interlocuteur_nom, interlocuteur_titre, interlocuteur_public_identifier) values ('chat-2', 'Hugo Inconnu', 'CTO', 'hugo-x') returning id",
      )
    ).rows[0].id;
  });
  afterAll(async () => db?.drop());

  const PROFIL = [
    "Camille Roux",
    "Head of Ops · Acme",
    "Ops chez Acme",
    "Lyon, France",
    "https://www.linkedin.com/in/camille-roux/",
    "Liste : Signal Notion · Étape : Premier message",
  ].join("\n");
  const CONVERSATION = [
    "Conversation avec Camille Roux",
    "",
    "[mer. 18 nov. 2026, 10:05] Moi : Bonjour Camille",
    "[mer. 18 nov. 2026, 11:30] Camille Roux : Bonjour ! Avec plaisir.",
  ].join("\n");

  it("profil uniquement, conversation uniquement, ou les deux", async () => {
    expect(await texteCopieDepuis(db.pool, { conversationId: conv, contenu: "profil" })).toBe(PROFIL);
    expect(await texteCopieDepuis(db.pool, { conversationId: conv, contenu: "conversation" })).toBe(CONVERSATION);
    expect(await texteCopieDepuis(db.pool, { conversationId: conv, contenu: "tout" })).toBe(`${PROFIL}\n\n${CONVERSATION}`);
  });

  it("interlocuteur hors CRM : nom, titre et lien LinkedIn reconstruit", async () => {
    expect(await texteCopieDepuis(db.pool, { conversationId: horsCrm, contenu: "profil" })).toBe(
      ["Hugo Inconnu", "CTO", "https://www.linkedin.com/in/hugo-x/"].join("\n"),
    );
    expect(await texteCopieDepuis(db.pool, { conversationId: horsCrm, contenu: "conversation" })).toBe("Conversation avec Hugo Inconnu\n\n(aucun message)");
  });

  it("entrée invalide refusée ; conversation inconnue : rien", async () => {
    await expect(texteCopieDepuis(db.pool, { conversationId: "pas-un-uuid", contenu: "tout" })).rejects.toThrow();
    await expect(texteCopieDepuis(db.pool, { conversationId: conv, contenu: "mots_de_passe" })).rejects.toThrow();
    expect(await texteCopieDepuis(db.pool, { conversationId: crypto.randomUUID(), contenu: "tout" })).toBeNull();
  });
});
