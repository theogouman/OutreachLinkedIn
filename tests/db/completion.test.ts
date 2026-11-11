import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { completerConversations } from "@/server/completion-conversations";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur } from "@/server/unipile/executeur";
import { creerClientSimule } from "@/server/unipile/simule";
import type { ClientLinkedIn, ProfilLu } from "@/server/unipile/types";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7]);

describe.skipIf(!TEST_DATABASE_URL)("complétion immédiate des conversations (nom, photo, rattachement par le nom)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.messages, public.conversations, public.prospects cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  const deps = (nom: string | null, id = "ACoLEA") => ({
    lireConversation: async () => ({ ok: true as const, donnees: { interlocuteurId: id, nom, photoUrl: "https://media.licdn.com/c.jpg" } }),
    telechargerPhoto: async () => ({ contenu: JPEG, type: "image/jpeg" as const }),
  });
  const conversation = async (pid: string | null = "ACoLEA") =>
    (await db.pool.query("insert into public.conversations (unipile_chat_id, interlocuteur_provider_id) values ('chat_1', $1) returning id", [pid])).rows[0]
      .id as string;
  const prospect = async (prenom: string, nom: string, url: string, providerId: string | null = null) =>
    (
      await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, provider_id) values ($1, $1, $2, $3, $4) returning id",
        [url, prenom, nom, providerId],
      )
    ).rows[0].id as string;
  const etat = async (id: string) =>
    (
      await db.pool.query(
        "select prospect_id, interlocuteur_nom, rattachement_par_nom, photo_maj is not null as photo, interlocuteur_complete_le is not null as complete from public.conversations where id = $1",
        [id],
      )
    ).rows[0];

  it("hors CRM : nom et photo de l'interlocuteur tout de suite, sans lecture de profil", async () => {
    const id = await conversation();
    expect(await completerConversations(db.pool, deps("Xavier Durand"))).toBe(1);
    expect(await etat(id)).toEqual({ prospect_id: null, interlocuteur_nom: "Xavier Durand", rattachement_par_nom: false, photo: true, complete: true });
    // Une seule fois par conversation.
    expect(await completerConversations(db.pool, deps("Autre"))).toBe(0);
  });

  it("un seul prospect du même nom (accents et casse ignorés) : rattachement immédiat, marqué provisoire", async () => {
    const p = await prospect("Léa", "Martin", "linkedin.com/in/lea-martin");
    const id = await conversation();
    await completerConversations(db.pool, deps("lea MARTIN"));
    expect(await etat(id)).toMatchObject({ prospect_id: p, rattachement_par_nom: true });
  });

  it("homonymes ou autre identifiant LinkedIn : aucun rattachement au hasard", async () => {
    await prospect("Léa", "Martin", "linkedin.com/in/lea-martin");
    await prospect("Lea", "Martin", "linkedin.com/in/lea-martin-2");
    const id = await conversation();
    await completerConversations(db.pool, deps("Léa Martin"));
    expect((await etat(id)).prospect_id).toBeNull();

    await db.pool.query("truncate public.conversations, public.prospects cascade");
    await prospect("Léa", "Martin", "linkedin.com/in/lea-martin", "ACoAUTRE");
    const id2 = await conversation();
    await completerConversations(db.pool, deps("Léa Martin"));
    expect((await etat(id2)).prospect_id).toBeNull();
  });

  describe("la lecture de profil confirme ou corrige le rattachement par le nom", () => {
    const lire = (p: Partial<ProfilLu>) => {
      const profil: ProfilLu = {
        providerId: "ACoLEA",
        publicIdentifier: "lea-martin-2",
        prenom: "Léa",
        nom: "Martin",
        titre: null,
        distance: null,
        invitation: null,
        photoUrl: null,
        ...p,
      };
      const client: ClientLinkedIn = { ...creerClientSimule(), lireProfil: async () => ({ ok: true, donnees: profil }) };
      return executerUnTour({
        pool: db.pool,
        executeur: creerExecuteur(client),
        appliquerEffets: appliquerEffetsUnipile,
        maintenant: () => new Date("2026-11-05T09:00:00Z"),
        aleatoire: () => 0,
      });
    };
    const identification = (conv: string) =>
      db.pool.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres)
         values ('lecture_profil', null, $1, $2, '2026-11-01')`,
        [{ public_identifier: "ACoLEA", conversation_id: conv }, `identification:${conv}`],
      );

    it("le nom avait trompé : la conversation passe au bon prospect (celui de l'URL)", async () => {
      const faux = await prospect("Léa", "Martin", "linkedin.com/in/lea-martin");
      const vrai = await prospect("Lea", "M.", "linkedin.com/in/lea-martin-2");
      const conv = await conversation();
      await db.pool.query("update public.conversations set prospect_id = $1, rattachement_par_nom = true where id = $2", [faux, conv]);
      await identification(conv);
      expect(await lire({})).toMatchObject({ resultat: "succes" });
      expect(await etat(conv)).toMatchObject({ prospect_id: vrai, rattachement_par_nom: false });
    });

    it("le nom avait trompé et la personne n'est pas un prospect : la conversation est détachée", async () => {
      const faux = await prospect("Léa", "Martin", "linkedin.com/in/lea-martin");
      const conv = await conversation();
      await db.pool.query("update public.conversations set prospect_id = $1, rattachement_par_nom = true where id = $2", [faux, conv]);
      await identification(conv);
      await lire({ publicIdentifier: "quelqu-un-d-autre" });
      expect(await etat(conv)).toMatchObject({ prospect_id: null, rattachement_par_nom: false });
    });

    it("le nom était juste : rattachement confirmé", async () => {
      const p = await prospect("Léa", "Martin", "linkedin.com/in/lea-martin-2");
      const conv = await conversation();
      await db.pool.query("update public.conversations set prospect_id = $1, rattachement_par_nom = true where id = $2", [p, conv]);
      await identification(conv);
      await lire({});
      expect(await etat(conv)).toMatchObject({ prospect_id: p, rattachement_par_nom: false });
    });
  });
});
