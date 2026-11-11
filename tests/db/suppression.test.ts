import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { EnvoiRefuse, supprimerProspect } from "@/server/mutations";

describe.skipIf(!TEST_DATABASE_URL)("suppression d'un prospect", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.messages, public.conversations, public.liens_linkedin, public.prospects cascade");
  });

  async function semer() {
    const p = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, provider_id, notes, details)
       values ('https://www.linkedin.com/in/ana', 'linkedin.com/in/ana', 'ACoANA', 'note', '{"requete": "x"}') returning id`,
    );
    const id = p.rows[0].id as string;
    const autre = (
      await db.pool.query("insert into public.prospects (linkedin_url, url_normalisee) values ('https://www.linkedin.com/in/bob', 'linkedin.com/in/bob') returning id")
    ).rows[0].id as string;
    await db.pool.query("insert into public.photos_prospects (prospect_id, contenu, type_mime) values ($1, '\\xffd8ff00', 'image/jpeg')", [id]);
    const c = await db.pool.query("insert into public.conversations (unipile_chat_id, prospect_id) values ('chat_ana', $1) returning id", [id]);
    await db.pool.query("insert into public.messages (conversation_id, sens, texte, envoye_at) values ($1, 'entrant', 'Bonjour', now())", [c.rows[0].id]);
    await db.pool.query(
      `insert into public.actions (prospect_id, type, sortante, resultat) values
         ($1, 'invitation', true, 'succes'), ($1, 'changement_etape', false, 'succes'), ($1, 'acceptation', false, 'succes'), ($2, 'invitation', true, 'succes')`,
      [id, autre],
    );
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence) values ('lecture_profil', $1, '{\"public_identifier\": \"ana\"}', 'lecture:ana')",
      [id],
    );
    await db.pool.query(
      `insert into public.liens_linkedin (type, url_normalisee, provider_id, source) values
         ('relation', 'linkedin.com/in/ana', 'ACoANA', 'csv'), ('relation', 'linkedin.com/in/bob', null, 'csv')`,
    );
    return { id, autre };
  }

  const compter = async (sql: string, params: unknown[] = []) => (await db.pool.query(sql, params)).rows[0].n as number;

  it("efface la fiche et toutes ses données ; les actions envoyées restent, anonymes, pour les quotas", async () => {
    const { id, autre } = await semer();
    await supprimerProspect(db.pool, id);
    expect(await compter("select count(*)::int n from public.prospects where id = $1", [id])).toBe(0);
    expect(await compter("select count(*)::int n from public.photos_prospects")).toBe(0);
    expect(await compter("select count(*)::int n from public.conversations")).toBe(0);
    expect(await compter("select count(*)::int n from public.messages")).toBe(0);
    expect(await compter("select count(*)::int n from public.taches")).toBe(0);
    expect(await compter("select count(*)::int n from public.liens_linkedin where url_normalisee = 'linkedin.com/in/ana'")).toBe(0);
    const a = await db.pool.query("select prospect_id, type, sortante from public.actions order by type, prospect_id nulls first");
    expect(a.rows).toEqual([
      { prospect_id: null, type: "invitation", sortante: true },
      { prospect_id: autre, type: "invitation", sortante: true },
    ]);
    // L'autre prospect et ses liens sont intacts.
    expect(await compter("select count(*)::int n from public.prospects where id = $1", [autre])).toBe(1);
    expect(await compter("select count(*)::int n from public.liens_linkedin where url_normalisee = 'linkedin.com/in/bob'")).toBe(1);
  });

  it("refusée pendant une action en cours, pour un prospect inconnu ou un identifiant invalide", async () => {
    const { id } = await semer();
    await db.pool.query("update public.taches set statut = 'en_cours' where prospect_id = $1", [id]);
    await expect(supprimerProspect(db.pool, id)).rejects.toThrow(EnvoiRefuse);
    expect(await compter("select count(*)::int n from public.prospects where id = $1", [id])).toBe(1);
    await expect(supprimerProspect(db.pool, randomUUID())).rejects.toThrow(EnvoiRefuse);
    await expect(supprimerProspect(db.pool, "pas-un-uuid")).rejects.toThrow();
  });
});
