import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { inboxDepuis, prospectsDepuis } from "@/server/donnees";
import { semerDemo } from "@/server/demo";
import { FILTRES_INBOX, type FiltresInbox } from "@/lib/filtres/inbox";
import { appliquerLocalement } from "@/lib/filtres/definition";
import { FILTRES_PROSPECTS, type FiltresProspects } from "@/lib/filtres/prospects";

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
    for (const [id, prenom, nom, statut, etape, liste, relance] of lignes) {
      await db.pool.query(
        `insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, statut_relation, etape, liste_origine, prochaine_relance)
         values ($1, $1, $2, $3, $4, $5, $6, $7)`,
        [`linkedin.com/in/${id}`, prenom, nom, statut, etape, liste, relance],
      );
    }
  });
  afterAll(async () => db?.drop());

  const cas: Partial<FiltresProspects>[] = [
    {},
    { statut: "en_relation" },
    { etape: "premier_message" },
    { liste: "Webinaire" },
    { relanceAvant: "2026-11-10" },
    { recherche: "helene" },
    { recherche: "b" },
    { statut: "en_relation", liste: "Webinaire" },
    { etape: "premier_message", recherche: "paul" },
    { relanceAvant: "2026-12-31", statut: "en_attente" },
  ];

  it.each(cas)("mêmes lignes pour %o", async (f) => {
    const filtres = { page: 1, ...f } as FiltresProspects;
    const tous = (await prospectsDepuis(db.pool, { page: 1 })).lignes;
    const serveur = (await prospectsDepuis(db.pool, filtres)).lignes.map((l) => l.id).sort();
    const local = appliquerLocalement(tous, filtres, FILTRES_PROSPECTS).map((l) => l.id).sort();
    expect(local).toEqual(serveur);
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
