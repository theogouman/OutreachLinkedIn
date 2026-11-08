import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { activiteDepuis, entonnoirDepuis } from "@/server/donnees";

describe.skipIf(!TEST_DATABASE_URL)("Statistiques : entonnoir par étape et activité par jour", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const prospect = async (cle: string, etape: string) => {
      const r = await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, etape) values ($1, $1, $2) returning id",
        [`linkedin.com/in/${cle}`, etape],
      );
      ids[cle] = r.rows[0].id;
    };
    await prospect("aaa", "a_contacter");
    await prospect("bbb", "connecte");
    await prospect("ccc", "repondu");
    await prospect("ddd", "gagne");
    // Perdu après avoir été connecté : compte jusqu'à « Connecté », pas au-delà.
    await prospect("eee", "perdu");
    await db.pool.query(
      `insert into public.actions (prospect_id, type, sortante, resultat, details)
       values ($1, 'changement_etape', false, 'succes', '{"vers":"connecte"}')`,
      [ids.eee],
    );
    // Pas intéressé sans historique : seulement la première étape.
    await prospect("fff", "pas_interesse");

    const action = (type: string, quand: string, resultat = "succes") =>
      db.pool.query(
        "insert into public.actions (prospect_id, type, sortante, resultat, created_at) values ($1, $2, true, $3, $4)",
        [ids.aaa, type, resultat, quand],
      );
    await action("invitation", "2026-11-02T08:00:00Z");
    await action("message", "2026-11-02T15:00:00Z");
    // 23 h 30 UTC = 0 h 30 à Paris le lendemain.
    await action("message", "2026-11-03T23:30:00Z");
    await action("lecture_profil", "2026-11-05T10:00:00Z");
    await action("message", "2026-11-05T11:00:00Z", "echec");
    await action("lecture_liste", "2026-11-05T12:00:00Z");
    await action("invitation", "2026-01-02T10:00:00Z"); // hors période
  });
  afterAll(async () => db?.drop());

  it("entonnoir : chaque étape compte les prospects qui l'ont atteinte, sorties à part", async () => {
    const e = await entonnoirDepuis(db.pool);
    const parCode = Object.fromEntries(e.etapes.map((x) => [x.code, x.valeur]));
    expect(e.etapes.map((x) => x.code)).toEqual([
      "a_contacter", "invitation_envoyee", "connecte", "premier_message", "relance_1", "relance_2", "repondu", "rdv_fixe", "gagne",
    ]);
    expect(parCode).toMatchObject({ a_contacter: 6, invitation_envoyee: 4, connecte: 4, premier_message: 2, repondu: 2, rdv_fixe: 1, gagne: 1 });
    expect(e.sorties).toEqual([
      { code: "perdu", libelle: "Perdu", valeur: 1 },
      { code: "pas_interesse", libelle: "Pas intéressé", valeur: 1 },
    ]);
  });

  it("activité : actions LinkedIn réussies par jour (heure de Paris), sans les synchronisations", async () => {
    const a = await activiteDepuis(db.pool, new Date("2026-11-06T12:00:00Z"), 26);
    expect(a.jours).toEqual([
      { jour: "2026-11-02", total: 2, invitations: 1, messages: 1, lectures: 0 },
      { jour: "2026-11-04", total: 1, invitations: 0, messages: 1, lectures: 0 },
      { jour: "2026-11-05", total: 1, invitations: 0, messages: 0, lectures: 1 },
    ]);
    expect(a.debut).toBe("2026-05-11");
    expect(a.fin).toBe("2026-11-06");
    expect(a.joursActifs).toBe(3);
  });
});
