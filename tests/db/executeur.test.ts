import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur } from "@/server/unipile/executeur";
import { creerClientSimule, idSimule } from "@/server/unipile/simule";
import type { ClientLinkedIn } from "@/server/unipile/types";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("exécution des lectures LinkedIn (client simulé)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.prospects, public.liens_linkedin, public.sync_runs cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  const tour = (client: ClientLinkedIn) =>
    executerUnTour({ pool: db.pool, executeur: creerExecuteur(client), appliquerEffets: appliquerEffetsUnipile, maintenant: () => JEUDI_10H, aleatoire: () => 0 });

  async function prospectAvecLecture(id: string) {
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, public_identifier, statut_relation, etape) values ($1, $2, $3, $4, $5) returning id",
      [`https://www.linkedin.com/in/${id}`, `linkedin.com/in/${id}`, id, "a_inviter", "a_contacter"],
    );
    await db.pool.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres)
       values ('lecture_profil', $1, $2, $3, '2026-11-01')`,
      [p.rows[0].id, { public_identifier: id }, `lecture_profil:${p.rows[0].id}`],
    );
    return p.rows[0].id as string;
  }

  it("la lecture de profil enregistre le provider_id une fois pour toutes", async () => {
    const id = await prospectAvecLecture("alice");
    expect(await tour(creerClientSimule())).toMatchObject({ resultat: "succes" });
    const r = await db.pool.query("select provider_id from public.prospects where id = $1", [id]);
    expect(r.rows[0].provider_id).toBe(idSimule("alice"));
  });

  it("une relation de 1er degré vue sur le profil met le statut à jour", async () => {
    const id = await prospectAvecLecture("bruno");
    const client: ClientLinkedIn = {
      ...creerClientSimule(),
      lireProfil: async () => ({
        ok: true,
        donnees: { providerId: "ACoB", publicIdentifier: "bruno", prenom: null, nom: null, titre: null, distance: "FIRST_DEGREE", invitation: null },
      }),
    };
    await tour(client);
    const r = await db.pool.query("select statut_relation from public.prospects where id = $1", [id]);
    expect(r.rows[0].statut_relation).toBe("en_relation");
  });

  it("un doublon de provider_id n'écrase pas une autre fiche", async () => {
    await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, provider_id) values ('https://linkedin.com/in/old', 'linkedin.com/in/old', $1)",
      [idSimule("chloe")],
    );
    const id = await prospectAvecLecture("chloe");
    await tour(creerClientSimule());
    const p = await db.pool.query("select provider_id from public.prospects where id = $1", [id]);
    expect(p.rows[0].provider_id).toBeNull();
    const t = await db.pool.query("select derniere_erreur from public.taches where prospect_id = $1", [id]);
    expect(t.rows[0].derniere_erreur).toMatch(/^doublon de /);
  });

  it("la lecture d'une liste met à jour les statuts et détecte les acceptations", async () => {
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, provider_id, statut_relation, etape) values ('https://linkedin.com/in/dan', 'linkedin.com/in/dan', 'ACoDAN', 'en_attente', 'invitation_envoyee') returning id",
    );
    await db.pool.query(
      "insert into public.taches (type_action, payload, cle_idempotence, executer_apres) values ('lecture_liste', $1, 'sync-1', '2026-11-01')",
      [{ liste: "relations" }],
    );
    const client = creerClientSimule({ relations: [{ providerId: "ACoDAN", publicIdentifier: null, date: new Date("2026-11-04T10:00:00Z") }] });
    await tour(client);
    const r = await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [p.rows[0].id]);
    expect(r.rows[0]).toEqual({ statut_relation: "en_relation", etape: "connecte" });
    const run = await db.pool.query("select type, nb_elements, statut from public.sync_runs");
    expect(run.rows).toEqual([{ type: "relations", nb_elements: 1, statut: "succes" }]);
  });

  it("phase 1 : une invitation n'est jamais envoyée", async () => {
    await db.pool.query(
      "insert into public.taches (type_action, payload, cle_idempotence, executer_apres) values ('invitation', '{}', 'inv-1', '2026-11-01')",
    );
    expect(await tour(creerClientSimule())).toMatchObject({ resultat: "echec" });
  });
});
