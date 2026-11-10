import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, photosManquantesDepuis } from "@/server/unipile/executeur";
import { creerClientSimule } from "@/server/unipile/simule";
import type { ClientLinkedIn, Liste, PageListe } from "@/server/unipile/types";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);

describe.skipIf(!TEST_DATABASE_URL)("lecture complète des listes : identifiant et photo de tous les prospects d'un coup", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query(
      "truncate public.actions, public.taches, public.prospects, public.liens_linkedin, public.sync_runs, public.conversations cascade",
    );
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
    await db.pool.query("update public.quotas set plafond_jour = 80 where type_quota = 'lecture_liste'");
  });

  /** Client dont la liste est servie en pages, avec le curseur demandé à chaque appel. */
  function clientPagine(pages: Record<string, PageListe>, appels: { liste: Liste; curseur?: string }[]): ClientLinkedIn {
    return {
      ...creerClientSimule(),
      lireListe: async (liste, _limite, curseur) => {
        appels.push({ liste, curseur });
        return { ok: true, donnees: pages[curseur ?? "debut"] ?? { personnes: [], suivant: null } };
      },
    };
  }
  const tour = (client: ClientLinkedIn) =>
    executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(client, {
        photosManquantes: photosManquantesDepuis(db.pool),
        telechargerPhoto: async () => ({ contenu: JPEG, type: "image/jpeg" }),
      }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
    }).then(async (b) => {
      await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
      return b;
    });
  const prospect = async (id: string, statut = "en_relation") => {
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, public_identifier, statut_relation, etape) values ($1, $2, $3, $4, 'a_contacter') returning id",
      [`https://www.linkedin.com/in/${id}`, `linkedin.com/in/${id}`, id, statut],
    );
    await db.pool.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres)
       values ('lecture_profil', $1, $2, $3, '2026-11-01')`,
      [p.rows[0].id, { public_identifier: id }, `lecture_profil:${p.rows[0].id}`],
    );
    return p.rows[0].id as string;
  };
  const lancer = (liste: Liste) =>
    db.pool.query(
      `insert into public.taches (type_action, payload, cle_idempotence, executer_apres) values ('lecture_liste', $1, $2, '2026-11-01')`,
      [{ liste, limite: 1000, complete: true, page: 1 }, `complete:${liste}:debut`],
    );
  const personne = (id: string) => ({ providerId: `ACo${id}`, publicIdentifier: id, date: null, photoUrl: `https://media.licdn.com/${id}.jpg` });

  it("parcourt les pages, enregistre identifiant et photo, annule les lectures de profil devenues inutiles", async () => {
    const a = await prospect("anna");
    const b = await prospect("ben");
    await lancer("relations");
    const appels: { liste: Liste; curseur?: string }[] = [];
    const client = clientPagine({ debut: { personnes: [personne("anna")], suivant: "p2" }, p2: { personnes: [personne("ben"), personne("inconnu")], suivant: "p3" } }, appels);

    // La lecture de liste passe avant les lectures de profil, plus anciennes.
    expect(await tour(client)).toMatchObject({ resultat: "succes" });
    expect(await tour(client)).toMatchObject({ resultat: "succes" });
    expect(appels).toEqual([{ liste: "relations", curseur: undefined }, { liste: "relations", curseur: "p2" }]);

    const r = await db.pool.query("select id, provider_id, photo_maj is not null as photo from public.prospects order by public_identifier");
    expect(r.rows).toEqual([
      { id: a, provider_id: "ACoanna", photo: true },
      { id: b, provider_id: "ACoben", photo: true },
    ]);
    const t = await db.pool.query("select statut, count(*)::int as n from public.taches where type_action = 'lecture_profil' group by 1");
    expect(t.rows).toEqual([{ statut: "annulee", n: 2 }]);
    // Tous les prospects en relation sont identifiés : pas de page 3 (inutile de parcourir des milliers de relations).
    const suite = await db.pool.query("select count(*)::int as n from public.taches where type_action = 'lecture_liste' and statut = 'en_attente'");
    expect(suite.rows[0].n).toBe(0);
  });

  it("les invitations envoyées sont toujours lues jusqu'à la dernière page", async () => {
    await prospect("cleo", "en_attente");
    await lancer("invitations_envoyees");
    const appels: { liste: Liste; curseur?: string }[] = [];
    const client = clientPagine({ debut: { personnes: [personne("cleo")], suivant: "p2" }, p2: { personnes: [], suivant: null } }, appels);
    await tour(client);
    await tour(client);
    await tour(client);
    expect(appels.map((x) => x.curseur)).toEqual([undefined, "p2"]);
  });

  it("n'écrase pas l'identifiant d'un autre prospect, ne relit pas une photo déjà là, ne touche pas aux identifications", async () => {
    await lancer("relations");
    const a = await prospect("dan");
    await db.pool.query("update public.prospects set provider_id = 'ACoAUTRE' where id = $1", [a]);
    const conv = await db.pool.query(
      "insert into public.conversations (unipile_chat_id, interlocuteur_provider_id, interlocuteur_nom) values ('chat_x', 'ACoeve', 'Eve') returning id",
    );
    await db.pool.query(
      `insert into public.taches (type_action, payload, cle_idempotence, executer_apres) values ('lecture_profil', $1, 'identification:x', '2026-11-01')`,
      [{ public_identifier: "ACoeve", conversation_id: conv.rows[0].id }],
    );
    const vues: string[] = [];
    const client: ClientLinkedIn = {
      ...clientPagine({ debut: { personnes: [personne("dan"), personne("eve")], suivant: null } }, []),
    };
    await executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(client, {
        photosManquantes: photosManquantesDepuis(db.pool),
        telechargerPhoto: async (u) => (vues.push(u), { contenu: JPEG, type: "image/jpeg" }),
      }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
    });
    expect((await db.pool.query("select provider_id, photo_maj from public.prospects where id = $1", [a])).rows[0]).toEqual({
      provider_id: "ACoAUTRE",
      photo_maj: null,
    });
    // Interlocuteur hors CRM : sa photo vient de la liste ; sa lecture d'identification reste en file.
    expect((await db.pool.query("select photo_maj is not null as photo from public.conversations")).rows[0].photo).toBe(true);
    expect(vues).toEqual(["https://media.licdn.com/eve.jpg"]);
    const ident = await db.pool.query("select statut from public.taches where cle_idempotence = 'identification:x'");
    expect(ident.rows[0].statut).toBe("en_attente");
  });
});
