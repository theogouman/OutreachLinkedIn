import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur } from "@/server/unipile/executeur";
import { creerClientSimule } from "@/server/unipile/simule";
import type { ClientLinkedIn, ProfilLu } from "@/server/unipile/types";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);

describe.skipIf(!TEST_DATABASE_URL)("identification de l'interlocuteur d'une conversation hors CRM", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.messages, public.conversations, public.prospects cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  const profil = (p: Partial<ProfilLu>): ProfilLu => ({
    providerId: "ACoLEA",
    publicIdentifier: "lea-martin",
    prenom: "Léa",
    nom: "Martin",
    titre: "Head of Ops chez Acme",
    distance: "FIRST_DEGREE",
    invitation: null,
    photoUrl: "https://media.licdn.com/p.jpg",
    ...p,
  });
  const tour = (p: ProfilLu) => {
    const client: ClientLinkedIn = { ...creerClientSimule(), lireProfil: async () => ({ ok: true, donnees: p }) };
    return executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(client, { telechargerPhoto: async () => ({ contenu: JPEG, type: "image/jpeg" }) }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
    });
  };

  async function conversationHorsCrm() {
    const c = await db.pool.query(
      "insert into public.conversations (unipile_chat_id, interlocuteur_provider_id) values ('chat_lea', 'ACoLEA') returning id",
    );
    await db.pool.query("insert into public.messages (conversation_id, sens, texte, envoye_at) values ($1, 'sortant', 'Bonjour', now())", [c.rows[0].id]);
    await db.pool.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres)
       values ('lecture_profil', null, $1, $2, '2026-11-01')`,
      [{ public_identifier: "ACoLEA", conversation_id: c.rows[0].id }, `identification:${c.rows[0].id}`],
    );
    return c.rows[0].id as string;
  }

  it("prospect retrouvé par son URL : conversation rattachée, identifiant et photo enregistrés, sa lecture retirée de la file", async () => {
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, statut_relation) values ('https://www.linkedin.com/in/lea-martin', 'linkedin.com/in/lea-martin', 'en_relation') returning id",
    );
    const id = p.rows[0].id;
    await db.pool.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres)
       values ('lecture_profil', $1, '{"public_identifier": "lea-martin"}', 'lecture:lea', '2026-11-01')`,
      [id],
    );
    const conv = await conversationHorsCrm();
    expect(await tour(profil({}))).toMatchObject({ resultat: "succes" });
    const c = await db.pool.query("select prospect_id from public.conversations where id = $1", [conv]);
    expect(c.rows[0].prospect_id).toBe(id);
    const q = await db.pool.query("select provider_id, photo_maj is not null as photo from public.prospects where id = $1", [id]);
    expect(q.rows[0]).toEqual({ provider_id: "ACoLEA", photo: true });
    const t = await db.pool.query("select statut from public.taches where prospect_id = $1", [id]);
    expect(t.rows[0].statut).toBe("annulee");
  });

  it("personne hors CRM : nom, poste, identifiant public et photo gardés sur la conversation, aucun prospect créé", async () => {
    const conv = await conversationHorsCrm();
    expect(await tour(profil({}))).toMatchObject({ resultat: "succes" });
    const c = await db.pool.query(
      "select prospect_id, interlocuteur_nom, interlocuteur_titre, interlocuteur_public_identifier, photo_maj is not null as photo from public.conversations where id = $1",
      [conv],
    );
    expect(c.rows[0]).toEqual({
      prospect_id: null,
      interlocuteur_nom: "Léa Martin",
      interlocuteur_titre: "Head of Ops chez Acme",
      interlocuteur_public_identifier: "lea-martin",
      photo: true,
    });
    expect((await db.pool.query("select count(*)::int n from public.prospects")).rows[0].n).toBe(0);
    expect((await db.pool.query("select count(*)::int n from public.photos_conversations")).rows[0].n).toBe(1);
  });
});
