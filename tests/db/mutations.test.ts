import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { annulerTache, basculerArret, majPlafonds, majReglages, trancherIncertaine } from "@/server/mutations";
import { MAXIMA } from "@/lib/plafonds";
import { etatOutilDepuis, prospectsDepuis } from "@/server/donnees";

const plafondsMax = Object.fromEntries(Object.entries(MAXIMA).map(([t, b]) => [t, { ...b }]));

describe.skipIf(!TEST_DATABASE_URL)("modifications depuis l'interface", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());

  it("les maxima de l'interface sont exactement ceux acceptés par la base", async () => {
    await majPlafonds(db.pool, plafondsMax);
    const r = await db.pool.query("select plafond_jour from public.quotas where type_quota = 'invitation'");
    expect(r.rows[0].plafond_jour).toBe(30);
    const auDessus = structuredClone(plafondsMax) as Record<string, { jour: number | null }>;
    auDessus.invitation!.jour = 31;
    await expect(majPlafonds(db.pool, auDessus)).rejects.toThrow();
    // Et la base refuse aussi, indépendamment de la validation applicative.
    await expect(db.pool.query("update public.quotas set plafond_jour = 31 where type_quota = 'invitation'")).rejects.toThrow();
  });

  it("refuse des réglages incohérents", async () => {
    const ok = {
      plages: { jours: [1, 2, 3], creneaux: [{ debut: "09:00", fin: "12:00" }] },
      delaiMinS: 120,
      delaiMaxS: 300,
      cadence: { relance_1_jours: 4, relance_2_jours: 7 },
    };
    await majReglages(db.pool, ok);
    for (const mauvais of [
      { ...ok, delaiMinS: 30 },
      { ...ok, delaiMaxS: 100 },
      { ...ok, plages: { jours: [1, 1], creneaux: ok.plages.creneaux } },
      { ...ok, plages: { jours: [1], creneaux: [{ debut: "12:00", fin: "09:00" }] } },
      { ...ok, plages: { jours: [1], creneaux: [{ debut: "9h", fin: "12:00" }] } },
    ]) {
      await expect(majReglages(db.pool, mauvais)).rejects.toThrow();
    }
  });

  it("bouton d'arrêt : l'état de la file passe « en pause »", async () => {
    await basculerArret(db.pool, true);
    expect((await etatOutilDepuis(db.pool)).etatFile).toBe("en_pause");
    await basculerArret(db.pool, false);
    expect((await etatOutilDepuis(db.pool)).etatFile).toBe("en_cours");
  });

  it("annuler : seulement une tâche en attente", async () => {
    const t = await db.pool.query(
      "insert into public.taches (type_action, cle_idempotence, statut) values ('message', 'a1', 'en_attente'), ('message', 'a2', 'en_cours') returning id",
    );
    expect(await annulerTache(db.pool, t.rows[0].id)).toBe(true);
    expect(await annulerTache(db.pool, t.rows[1].id)).toBe(false);
    await expect(annulerTache(db.pool, "pas-un-uuid")).rejects.toThrow();
  });

  it("une tâche incertaine n'est remise en file que sur décision explicite", async () => {
    const t = await db.pool.query("insert into public.taches (type_action, cle_idempotence, statut) values ('message', 'i1', 'incertaine') returning id");
    expect(await trancherIncertaine(db.pool, t.rows[0].id, "remettre")).toBe(true);
    expect((await db.pool.query("select statut from public.taches where id = $1", [t.rows[0].id])).rows[0].statut).toBe("en_attente");
    await expect(trancherIncertaine(db.pool, t.rows[0].id, "supprimer")).rejects.toThrow();
  });

  it("recherche de prospects : les jokers SQL saisis sont traités comme du texte", async () => {
    await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, nom) values ('https://linkedin.com/in/a1','linkedin.com/in/a1','100% Growth'), ('https://linkedin.com/in/b1','linkedin.com/in/b1','Autre')",
    );
    expect((await prospectsDepuis(db.pool, { recherche: "100%", page: 1 })).total).toBe(1);
    expect((await prospectsDepuis(db.pool, { recherche: "%", page: 1 })).total).toBe(1);
    expect((await prospectsDepuis(db.pool, { page: 1 })).total).toBe(2);
  });

  it("recherche de prospects : mêmes règles que le filtrage instantané (mots dans le désordre, sans accents)", async () => {
    await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, entreprise, poste) values
       ('https://linkedin.com/in/hd','linkedin.com/in/hd','Hélène','Durand','Société Générale','Directrice des opérations')`,
    );
    const total = async (recherche: string) => (await prospectsDepuis(db.pool, { recherche, page: 1 })).total;
    expect(await total("helene")).toBe(1);
    expect(await total("DURAND hélène")).toBe(1);
    expect(await total("societe operations")).toBe(1);
    expect(await total("helene martin")).toBe(0);
    expect(await total("   ")).toBe(3);
  });
});
