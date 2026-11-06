import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";

const AUTORISE = "theo@example.com";

describe.skipIf(!TEST_DATABASE_URL)("schéma : accès et garde-fous", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
    await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, prenom) values ('https://www.linkedin.com/in/jane', 'linkedin.com/in/jane', 'Jane')",
    );
  });
  afterAll(async () => db?.drop());

  it("refuse tout accès à un utilisateur non connecté", async () => {
    await expect(asUser(db.pool, null, (c) => c.query("select * from public.prospects"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("ne montre rien à un utilisateur connecté mais non autorisé", async () => {
    const res = await asUser(db.pool, "intrus@example.com", (c) => c.query("select * from public.prospects"));
    expect(res.rowCount).toBe(0);
  });

  it("montre les prospects à l'utilisateur autorisé", async () => {
    const res = await asUser(db.pool, AUTORISE, (c) => c.query("select * from public.prospects"));
    expect(res.rowCount).toBe(1);
  });

  it("interdit à l'interface d'écrire dans le journal des actions (compteurs de quotas)", async () => {
    await expect(
      asUser(db.pool, AUTORISE, (c) =>
        c.query("insert into public.actions (type, sortante, resultat) values ('message', true, 'succes')"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db.pool, AUTORISE, (c) => c.query("delete from public.actions"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("interdit à l'interface de lever un gel ou d'avancer la prochaine action", async () => {
    await expect(
      asUser(db.pool, AUTORISE, (c) => c.query("update public.quotas set gel_jusqu_a = null")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db.pool, AUTORISE, (c) => c.query("update public.reglages set prochaine_action_possible_a = now()")),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuse un plafond au-dessus de la recommandation Unipile, même en direct", async () => {
    await expect(
      db.pool.query("update public.quotas set plafond_jour = 31 where type_quota = 'invitation'"),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.pool.query("update public.quotas set plafond_mois = 6 where type_quota = 'note_invitation'"),
    ).rejects.toThrow(/check constraint/);
  });

  it("n'autorise l'interface qu'à créer des tâches en attente, sans verrou", async () => {
    await expect(
      asUser(db.pool, AUTORISE, (c) =>
        c.query(
          "insert into public.taches (type_action, cle_idempotence, statut) values ('lecture_liste', 'k1', 'faite')",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asUser(db.pool, AUTORISE, (c) =>
      c.query("insert into public.taches (type_action, cle_idempotence) values ('lecture_liste', 'k2') returning id"),
    );
    expect(ok.rowCount).toBe(1);
  });

  it("empêche de modifier une tâche déjà partie", async () => {
    const { rows } = await db.pool.query(
      "insert into public.taches (type_action, cle_idempotence, statut) values ('message', 'k3', 'en_cours') returning id",
    );
    const res = await asUser(db.pool, AUTORISE, (c) =>
      c.query("update public.taches set payload = '{\"texte\":\"x\"}' where id = $1", [rows[0].id]),
    );
    expect(res.rowCount).toBe(0);
  });

  it("garde les actions (et donc les compteurs) quand un prospect est supprimé", async () => {
    const { rows } = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee) values ('https://linkedin.com/in/bob', 'linkedin.com/in/bob') returning id",
    );
    await db.pool.query(
      "insert into public.actions (prospect_id, type, sortante, resultat) values ($1, 'invitation', true, 'succes')",
      [rows[0].id],
    );
    await db.pool.query("delete from public.prospects where id = $1", [rows[0].id]);
    const res = await db.pool.query("select prospect_id from public.actions where type = 'invitation'");
    expect(res.rows).toEqual([{ prospect_id: null }]);
  });

  it("refuse une clé d'idempotence en double", async () => {
    await db.pool.query("insert into public.taches (type_action, cle_idempotence) values ('message', 'dup')");
    await expect(
      db.pool.query("insert into public.taches (type_action, cle_idempotence) values ('message', 'dup')"),
    ).rejects.toThrow(/duplicate key/);
  });
});
