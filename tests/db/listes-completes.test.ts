import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, ESPACEMENT_PAGES_MS, photosManquantesDepuis } from "@/server/unipile/executeur";
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
  let tours = 0;
  beforeEach(async () => {
    tours = 0;
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
      // Chaque tour un quart d'heure après le précédent : rythme des pages d'un parcours complet.
      maintenant: () => new Date(JEUDI_10H.getTime() + tours * ESPACEMENT_PAGES_MS),
      aleatoire: () => 0,
    }).then(async (b) => {
      tours++;
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
      [{ liste, limite: 100, complete: true, page: 1 }, `complete:${liste}:debut`],
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

  it("pages d'un parcours complet espacées d'un quart d'heure (4 appels par heure au plus)", async () => {
    await prospect("finn");
    await lancer("relations");
    const appels: { liste: Liste; curseur?: string }[] = [];
    const client = clientPagine({ debut: { personnes: [personne("autre")], suivant: "p2" }, p2: { personnes: [], suivant: null } }, appels);
    await tour(client);
    const suite = await db.pool.query("select executer_apres from public.taches where type_action = 'lecture_liste' and statut = 'en_attente'");
    expect(suite.rows[0].executer_apres).toEqual(new Date(JEUDI_10H.getTime() + ESPACEMENT_PAGES_MS));
    expect(ESPACEMENT_PAGES_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });

  it("fin du parcours des invitations : une invitation disparue (prospect identifié) redescend, les autres restent", async () => {
    const vue = await prospect("vue", "en_attente");
    const partie = await prospect("partie", "en_attente");
    const inconnu = await prospect("inconnu-sans-id", "en_attente");
    const acceptee = await prospect("acceptee", "en_attente");
    await db.pool.query("update public.prospects set provider_id = 'ACo' || public_identifier, etape = 'invitation_envoyee' where id = any($1)", [
      [vue, partie, acceptee],
    ]);
    await db.pool.query("update public.prospects set etape = 'invitation_envoyee' where id = $1", [inconnu]);
    for (const id of ["vue", "partie", "inconnu-sans-id", "acceptee"]) {
      await db.pool.query(
        "insert into public.liens_linkedin (type, url_normalisee, source, vu_le) values ('invitation_envoyee', $1, 'csv', '2026-10-01')",
        [`linkedin.com/in/${id}`],
      );
    }
    await db.pool.query("insert into public.liens_linkedin (type, url_normalisee, source) values ('relation', 'linkedin.com/in/acceptee', 'webhook')");
    await lancer("invitations_envoyees");
    // Une seule page, sans suite : le parcours est complet. Personne « vue » listée sans URL (identifiant seulement).
    await tour(clientPagine({ debut: { personnes: [{ providerId: "ACovue", publicIdentifier: null, date: null }], suivant: null } }, []));

    const r = await db.pool.query("select id, statut_relation, etape from public.prospects where id = any($1)", [[vue, partie, inconnu, acceptee]]);
    const par = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(par[vue]).toMatchObject({ statut_relation: "en_attente", etape: "invitation_envoyee" });
    expect(par[partie]).toMatchObject({ statut_relation: "a_inviter", etape: "a_contacter" });
    expect(par[inconnu]).toMatchObject({ statut_relation: "en_attente" }); // non identifié : on ne conclut rien
    expect(par[acceptee]).toMatchObject({ statut_relation: "en_relation" });
    const journal = await db.pool.query(
      "select details from public.actions where prospect_id = $1 and type = 'changement_etape'",
      [partie],
    );
    expect(journal.rows.map((x) => x.details)).toEqual([{ vers: "a_contacter", cause: "invitation_disparue" }]);
  });

  it("parcours des invitations interrompu (page suivante en attente) : aucun statut ne redescend", async () => {
    const partie = await prospect("partie2", "en_attente");
    await db.pool.query("update public.prospects set provider_id = 'ACopartie2' where id = $1", [partie]);
    await db.pool.query(
      "insert into public.liens_linkedin (type, url_normalisee, source, vu_le) values ('invitation_envoyee', 'linkedin.com/in/partie2', 'csv', '2026-10-01')",
    );
    await lancer("invitations_envoyees");
    await tour(clientPagine({ debut: { personnes: [personne("autre")], suivant: "p2" } }, []));
    const r = await db.pool.query("select statut_relation from public.prospects where id = $1", [partie]);
    expect(r.rows[0].statut_relation).toBe("en_attente");
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

  it("invitations sans URL : rapprochement par le nom, seulement parmi les invitations en attente et sans homonyme", async () => {
    const lea = await prospect("lea-martin-x", "en_attente");
    await db.pool.query("update public.prospects set prenom = 'Léa', nom = 'Martin' where id = $1", [lea]);
    const a1 = await prospect("tom-a", "en_attente");
    const a2 = await prospect("tom-b", "en_attente");
    await db.pool.query("update public.prospects set prenom = 'Tom', nom = 'Durand' where id = any($1)", [[a1, a2]]);
    const rel = await prospect("zoe-r", "a_inviter");
    await db.pool.query("update public.prospects set prenom = 'Zoé', nom = 'Roy' where id = $1", [rel]);
    await lancer("invitations_envoyees");
    const sansUrl = (id: string, nom: string) => ({ providerId: `ACo${id}`, publicIdentifier: null, date: null, photoUrl: `https://media.licdn.com/${id}.jpg`, nom });
    const client = clientPagine(
      { debut: { personnes: [sansUrl("L", "lea martin"), sansUrl("T", "Tom Durand"), sansUrl("Z", "Zoé Roy")], suivant: null } },
      [],
    );
    await tour(client);
    const r = await db.pool.query("select id, provider_id, photo_maj is not null as photo from public.prospects where id = any($1)", [[lea, a1, a2, rel]]);
    const par = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(par[lea]).toMatchObject({ provider_id: "ACoL", photo: true });
    expect(par[a1].provider_id).toBeNull(); // homonymes : rien au hasard
    expect(par[a2].provider_id).toBeNull();
    expect(par[rel].provider_id).toBeNull(); // pas en attente d'invitation : pas ce prospect-là
  });

  it("sans curseur, une page pleine enchaîne par décalage ; une page identique arrête le parcours", async () => {
    await prospect("ivy", "en_attente");
    await lancer("invitations_envoyees");
    const appels: { offset?: number }[] = [];
    const pleine = (n: number) => Array.from({ length: n }, (_, i) => ({ providerId: `ACoP${i}`, publicIdentifier: null, date: null }));
    const client: ClientLinkedIn = {
      ...creerClientSimule(),
      // Décalage ignoré par le fournisseur : il renvoie toujours la même page pleine.
      lireListe: async (_l, _limite, _c, offset) => (appels.push({ offset }), { ok: true, donnees: { personnes: pleine(100), suivant: null } }),
    };
    for (let i = 0; i < 4; i++) await tour(client);
    expect(appels.map((a) => a.offset)).toEqual([undefined, 100]);
  });

  it("le nom affiché sur LinkedIn peut porter un titre ou des emojis", async () => {
    const aude = await prospect("aude-n", "en_attente");
    await db.pool.query("update public.prospects set prenom = 'Aude', nom = 'Nyadanu' where id = $1", [aude]);
    const pa = await prospect("pa-lb", "en_attente");
    await db.pool.query("update public.prospects set prenom = 'Pierre-Alix', nom = 'Lloret-Bavai 🚀' where id = $1", [pa]);
    await lancer("invitations_envoyees");
    const sansUrl = (id: string, nom: string) => ({ providerId: `ACo${id}`, publicIdentifier: null, date: null, photoUrl: null, nom });
    await tour(clientPagine({ debut: { personnes: [sansUrl("A", "Aude Nyadanu, PhD"), sansUrl("P", "Pierre Alix LLORET-BAVAI")], suivant: null } }, []));
    const r = await db.pool.query("select provider_id from public.prospects where id = any($1) order by public_identifier", [[aude, pa]]);
    expect(r.rows.map((x) => x.provider_id)).toEqual(["ACoA", "ACoP"]);
  });
});
