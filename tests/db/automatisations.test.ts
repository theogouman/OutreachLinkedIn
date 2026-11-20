import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";

const AUTORISE = "theo@example.com";

describe.skipIf(!TEST_DATABASE_URL)("automatisations : schéma", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
  });
  afterAll(async () => db?.drop());

  async function prospect(): Promise<string> {
    const id = crypto.randomUUID();
    await db.pool.query(
      "insert into public.prospects (id, linkedin_url, url_normalisee) values ($1, $2, $2)",
      [id, `https://linkedin.com/in/p-${id.slice(0, 8)}`],
    );
    return id;
  }

  it("une automatisation de départ, en pause : la relance des invitations en attente", async () => {
    const r = await db.pool.query("select code, nom, active, reglages, jsonb_typeof(modules) as modules from public.automatisations");
    expect(r.rows).toEqual([
      {
        code: "relance_invitations",
        nom: "Relance des invitations en attente",
        active: false,
        reglages: { attente_jours: { min: 21, max: 28 }, reinvitation_jours: { min: 21, max: 25 }, cycles: 2, plafond_jour: 10 },
        modules: "array",
      },
    ]);
  });

  it("RLS : rien pour un visiteur ni un intrus ; lecture seule pour l'utilisateur autorisé", async () => {
    for (const table of ["automatisations", "suivis_automatisation"]) {
      await expect(asUser(db.pool, null, (c) => c.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    expect((await asUser(db.pool, "intrus@example.com", (c) => c.query("select * from public.automatisations"))).rowCount).toBe(0);
    expect((await asUser(db.pool, AUTORISE, (c) => c.query("select * from public.automatisations"))).rowCount).toBe(1);
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("update public.automatisations set active = true"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("delete from public.suivis_automatisation"))).rejects.toThrow(/permission denied/);
    // Les colonnes ajoutées n'ouvrent aucun droit d'écriture à l'interface.
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("update public.liens_linkedin set invitation_id = 'x'"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuse en base des réglages hors bornes ou qui ne sont pas un objet, et un code inconnu", async () => {
    const maj = (reglages: unknown) =>
      db.pool.query("update public.automatisations set reglages = $1 where code = 'relance_invitations'", [JSON.stringify(reglages)]);
    await expect(maj([])).rejects.toThrow(/automatisations_reglages_objet/);
    await expect(maj({ attente_jours: { min: 21, max: 28 }, reinvitation_jours: { min: 14, max: 25 }, cycles: 2, plafond_jour: 10 })).rejects.toThrow(
      /automatisations_reinvitation_21_jours/,
    );
    await expect(maj({ attente_jours: { min: 21, max: 28 }, reinvitation_jours: { min: 21, max: 25 }, cycles: 2, plafond_jour: 50 })).rejects.toThrow(
      /automatisations_plafond_jour/,
    );
    await expect(
      db.pool.query("insert into public.automatisations (code, nom, reglages, modules) values ('pirate', 'x', '{}', '[]')"),
    ).rejects.toThrow(/automatisations_code_check/);
  });

  it("un seul suivi par prospect et par automatisation, supprimé avec le prospect, état en liste fermée", async () => {
    const auto = (await db.pool.query("select id from public.automatisations")).rows[0].id;
    const p = await prospect();
    const ins = (etat: string) =>
      db.pool.query(
        "insert into public.suivis_automatisation (automatisation_id, prospect_id, etat, invitation_envoyee_le) values ($1, $2, $3, now())",
        [auto, p, etat],
      );
    await ins("attente_retrait");
    await expect(ins("attente_retrait")).rejects.toThrow(/duplicate key/);
    await expect(
      db.pool.query("update public.suivis_automatisation set etat = 'piratee' where prospect_id = $1", [p]),
    ).rejects.toThrow(/suivis_automatisation_etat_check/);
    await db.pool.query("delete from public.prospects where id = $1", [p]);
    expect((await db.pool.query("select count(*)::int n from public.suivis_automatisation")).rows[0].n).toBe(0);
  });

  it("retrait d'invitation : nouvelle action LinkedIn, avec son quota (10 par jour, 30 au plus)", async () => {
    const q = await db.pool.query("select plafond_jour, plafond_semaine, plafond_mois from public.quotas where type_quota = 'retrait_invitation'");
    expect(q.rows).toEqual([{ plafond_jour: 10, plafond_semaine: null, plafond_mois: null }]);
    await expect(db.pool.query("update public.quotas set plafond_jour = 31 where type_quota = 'retrait_invitation'")).rejects.toThrow(
      /quotas_retrait_invitation_plafond/,
    );
    const t = await db.pool.query(
      "insert into public.taches (type_action, payload, cle_idempotence) values ('retrait_invitation', '{}', 'test-retrait') returning id",
    );
    await db.pool.query(
      "insert into public.actions (tache_id, type, sortante, resultat) values ($1, 'retrait_invitation', true, 'succes')",
      [t.rows[0].id],
    );
    await expect(
      db.pool.query("insert into public.actions (type, sortante, resultat) values ('retrait_invitation', false, 'succes')"),
    ).rejects.toThrow(/actions_check/);
  });

  it("colonnes ajoutées : identifiant d'invitation sur le lien, automatisation d'origine sur la tâche", async () => {
    const auto = (await db.pool.query("select id from public.automatisations")).rows[0].id;
    await db.pool.query(
      "insert into public.liens_linkedin (type, url_normalisee, source, invitation_id) values ('invitation_envoyee', 'linkedin.com/in/x', 'sync', 'inv-1')",
    );
    await expect(
      db.pool.query(
        "insert into public.liens_linkedin (type, url_normalisee, source, invitation_id) values ('invitation_envoyee', 'linkedin.com/in/y', 'sync', $1)",
        ["x".repeat(301)],
      ),
    ).rejects.toThrow(/liens_linkedin_invitation_id_check/);
    const t = await db.pool.query(
      "insert into public.taches (type_action, payload, cle_idempotence, automatisation_id) values ('invitation', '{}', 'test-auto', $1) returning automatisation_id",
      [auto],
    );
    expect(t.rows[0].automatisation_id).toBe(auto);
  });
});
