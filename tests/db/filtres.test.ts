import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { inboxDepuis, prospectsDepuis } from "@/server/donnees";
import { semerDemo } from "../fixtures/demo";
import { FILTRES_INBOX, type FiltresInbox } from "@/lib/filtres/inbox";
import { appliquerLocalement } from "@/lib/filtres/definition";
import { CHAMPS_TRI, FILTRES_PROSPECTS, trierLocalement, type Condition, type FiltresProspects } from "@/lib/filtres/prospects";

/*
 * Cohérence du standard de filtres : pour chaque combinaison, le filtrage instantané du
 * navigateur (règles locales) et la requête SQL renvoient exactement les mêmes prospects.
 * Tout nouveau filtre ajoute ici ses cas.
 */
describe.skipIf(!TEST_DATABASE_URL)("filtres des prospects : navigateur et serveur d'accord", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    const lignes: [string, string, string, string, string, string | null, string | null][] = [
      ["a1", "Camille", "Durand", "en_relation", "premier_message", "Salon", null],
      ["a2", "Hugo", "Martin", "en_attente", "invitation_envoyee", "Salon", "2026-11-10"],
      ["a3", "Léa", "Bernard", "en_relation", "repondu", "Webinaire", "2026-11-20"],
      ["a4", "Hélène", "Petit", "a_inviter", "a_contacter", null, "2026-11-05"],
      ["a5", "Paul", "Roux", "invitation_recue", "premier_message", "Webinaire", null],
    ];
    const ids: Record<string, string> = {};
    for (const [id, prenom, nom, statut, etape, liste, relance] of lignes) {
      ids[id] = (
        await db.pool.query(
          `insert into public.prospects (linkedin_url, url_normalisee, provider_id, prenom, nom, statut_relation, etape, liste_origine, prochaine_relance)
           values ($1, $1, $8, $2, $3, $4, $5, $6, $7) returning id`,
          [`linkedin.com/in/${id}`, prenom, nom, statut, etape, liste, relance, `ACo${id}`],
        )
      ).rows[0].id;
    }
    // Entrée en relation : lien LinkedIn par URL (a1) ou par identifiant (a3, deux liens : le plus récent compte).
    // 2026-10-31 23:30 UTC = 1er novembre à Paris : le jour de Paris fait foi.
    await db.pool.query(
      `insert into public.liens_linkedin (type, url_normalisee, provider_id, date_lien, source) values
         ('relation', 'linkedin.com/in/a1', null, '2026-10-31T23:30:00Z', 'csv'),
         ('relation', 'linkedin.com/in/autre-url', 'ACoa3', '2026-11-15T10:00:00Z', 'sync'),
         ('relation', 'linkedin.com/in/a3', null, '2026-09-01T10:00:00Z', 'csv'),
         ('invitation_envoyee', 'linkedin.com/in/a2', null, '2026-11-12T10:00:00Z', 'sync')`,
    );
    // Dernier message : la conversation la plus récente du prospect.
    await db.pool.query(
      `insert into public.conversations (unipile_chat_id, prospect_id, dernier_message_at) values
         ('c1', $1, '2026-11-18T09:00:00Z'), ('c2', $1, '2026-11-02T09:00:00Z'), ('c3', $2, '2026-11-01T09:00:00Z')`,
      [ids.a1, ids.a5],
    );
  });
  afterAll(async () => db?.drop());

  const cas: Condition[][] = [
    [],
    [{ champ: "statut", op: "est", valeurs: ["en_relation"] }],
    [{ champ: "statut", op: "nest_pas", valeurs: ["en_relation", "a_inviter"] }],
    [{ champ: "etape", op: "est", valeurs: ["premier_message"] }],
    [{ champ: "etape", op: "nest_pas", valeurs: ["premier_message", "repondu"] }],
    [{ champ: "liste", op: "est", valeurs: ["Webinaire"] }],
    [{ champ: "liste", op: "nest_pas", valeurs: ["Webinaire"] }],
    [{ champ: "relance", au: "2026-11-10" }],
    [{ champ: "relance", du: "2026-11-10", au: "2026-11-20" }],
    [{ champ: "relation", du: "2026-11-01" }],
    [{ champ: "relation", au: "2026-10-31" }],
    [{ champ: "message", du: "2026-11-10" }],
    [{ champ: "message", au: "2026-11-01" }],
    [{ champ: "statut", op: "est", valeurs: ["en_relation"] }, { champ: "liste", op: "est", valeurs: ["Webinaire"] }],
    [{ champ: "relance", au: "2026-12-31" }, { champ: "statut", op: "est", valeurs: ["en_attente"] }],
  ];
  const recherches = [undefined, "helene", "b"];

  it.each(cas.flatMap((c) => recherches.map((r) => [c, r] as const)))("mêmes lignes pour %j (recherche %s)", async (conditions, recherche) => {
    const filtres: FiltresProspects = { page: 1, ...(conditions.length ? { conditions } : {}), ...(recherche ? { recherche } : {}) };
    const tous = (await prospectsDepuis(db.pool, { page: 1 })).lignes;
    const serveur = (await prospectsDepuis(db.pool, filtres)).lignes.map((l) => l.id).sort();
    const local = appliquerLocalement(tous, filtres, FILTRES_PROSPECTS).map((l) => l.id).sort();
    expect(local).toEqual(serveur);
  });

  it.each(CHAMPS_TRI.flatMap((champ) => (["asc", "desc"] as const).map((sens) => ({ champ, sens }))))("même ordre pour le tri %o", async (tri) => {
    const ordre = Object.fromEntries((await db.pool.query("select code, ordre from public.etapes")).rows.map((r) => [r.code, r.ordre as number]));
    const tous = (await prospectsDepuis(db.pool, { page: 1 })).lignes;
    const serveur = (await prospectsDepuis(db.pool, { page: 1, tri })).lignes.map((l) => l.id);
    expect(trierLocalement(tous, tri, ordre).map((l) => l.id)).toEqual(serveur);
    expect(serveur).toHaveLength(5);
  });

  it("dates lues : relation (jour de Paris, lien le plus récent), dernier message", async () => {
    const tous = (await prospectsDepuis(db.pool, { page: 1 })).lignes;
    const de = (prenom: string) => tous.find((l) => l.prenom === prenom)!;
    expect([de("Camille").relationLe, de("Camille").dernierMessageLe]).toEqual(["2026-11-01", "2026-11-18"]);
    expect([de("Léa").relationLe, de("Léa").dernierMessageLe]).toEqual(["2026-11-15", null]);
    expect([de("Hugo").relationLe, de("Paul").dernierMessageLe]).toEqual([null, "2026-11-01"]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("filtres de l'Inbox : navigateur et serveur d'accord", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await semerDemo(db.pool, new Date("2026-11-05T09:00:00Z"));
  });
  afterAll(async () => db?.drop());

  const cas: Partial<FiltresInbox>[] = [
    {},
    { nonLus: "oui" },
    { aTraiter: "oui" },
    { horsCrm: "oui" },
    { nonLus: "oui", aTraiter: "oui" },
    { recherche: "sophie" },
    { recherche: "merci" },
    { recherche: "e", horsCrm: "oui" },
  ];

  it.each(cas)("mêmes conversations pour %o", async (f) => {
    const filtres = { page: 1, ...f } as FiltresInbox;
    const toutes = (await inboxDepuis(db.pool, { page: 1 })).lignes;
    const serveur = (await inboxDepuis(db.pool, filtres)).lignes.map((l) => l.id).sort();
    const local = appliquerLocalement(toutes, filtres, FILTRES_INBOX).map((l) => l.id).sort();
    expect(local).toEqual(serveur);
    if (Object.keys(f).length === 0) expect(serveur.length).toBeGreaterThan(5);
  });
});
