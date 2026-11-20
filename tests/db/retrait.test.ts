import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis } from "@/server/unipile/executeur";
import { annulerTache } from "@/server/mutations";
import { creerClientSimule } from "../fixtures/client-simule";
import type { ClientLinkedIn } from "@/server/unipile/types";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("retrait d'invitation (action de la file)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.liens_linkedin, public.prospects cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  /** Prospect « en attente », identifié, avec son lien d'invitation (et son identifiant, s'il est connu). */
  async function enAttente(invitationId: string | null = "demo-inv-1") {
    const nom = `p-${randomUUID().slice(0, 8)}`;
    const p = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, provider_id, statut_relation, etape)
       values ($1, $2, $3, $4, 'en_attente', 'invitation_envoyee') returning id`,
      [`https://www.linkedin.com/in/${nom}`, `linkedin.com/in/${nom}`, nom, `ACo${nom}`],
    );
    await db.pool.query(
      "insert into public.liens_linkedin (type, url_normalisee, provider_id, source, invitation_id, date_lien) values ('invitation_envoyee', $1, $2, 'sync', $3, '2026-10-01')",
      [`linkedin.com/in/${nom}`, `ACo${nom}`, invitationId],
    );
    return p.rows[0].id as string;
  }
  const enFile = async (prospectId: string) =>
    (
      await db.pool.query(
        "insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres) values ('retrait_invitation', $1, $2, $3, '2026-11-01') returning id",
        [prospectId, { prospect_id: prospectId }, `retrait:${prospectId}`],
      )
    ).rows[0].id as string;

  const tour = (client: ClientLinkedIn) =>
    executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(client, { lireDestinataire: lireDestinataireDepuis(db.pool) }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
    });
  const etat = async (id: string) => {
    const p = await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [id]);
    const l = await db.pool.query(
      "select count(*)::int n from public.liens_linkedin l join public.prospects p on l.provider_id = p.provider_id where p.id = $1 and l.type = 'invitation_envoyee'",
      [id],
    );
    const a = await db.pool.query("select resultat, sortante, details from public.actions where prospect_id = $1 and type = 'retrait_invitation'", [id]);
    return { prospect: p.rows[0], liens: l.rows[0].n, journal: a.rows };
  };

  it("retire l'invitation : identifiant relu en base, lien retiré, statut « à inviter », étape conservée, journal", async () => {
    const id = await enAttente("demo-inv-42");
    await enFile(id);
    const recus: string[] = [];
    const client: ClientLinkedIn = { ...creerClientSimule(), retirerInvitation: async (inv) => (recus.push(inv), { ok: true, donnees: { dejaDisparue: false } }) };
    expect(await tour(client)).toMatchObject({ statut: "execute", resultat: "succes" });
    expect(recus).toEqual(["demo-inv-42"]);
    expect(await etat(id)).toEqual({
      prospect: { statut_relation: "a_inviter", etape: "invitation_envoyee" },
      liens: 0,
      journal: [{ resultat: "succes", sortante: true, details: {} }],
    });
  });

  it("invitation déjà disparue (404) : même effet, noté au journal, sans échec", async () => {
    const id = await enAttente();
    await enFile(id);
    const client: ClientLinkedIn = { ...creerClientSimule(), retirerInvitation: async () => ({ ok: true, donnees: { dejaDisparue: true } }) };
    expect(await tour(client)).toMatchObject({ resultat: "succes" });
    expect(await etat(id)).toMatchObject({
      prospect: { statut_relation: "a_inviter" },
      liens: 0,
      journal: [{ resultat: "succes", details: { deja_disparue: true } }],
    });
  });

  it("rien n'est envoyé si le prospect n'est plus en attente, ou si l'identifiant de l'invitation est inconnu", async () => {
    let appels = 0;
    const client: ClientLinkedIn = { ...creerClientSimule(), retirerInvitation: async () => (appels++, { ok: true, donnees: { dejaDisparue: false } }) };

    const accepte = await enAttente();
    await db.pool.query("update public.prospects set statut_relation = 'en_relation' where id = $1", [accepte]);
    await enFile(accepte);
    expect(await tour(client)).toMatchObject({ resultat: "echec" });

    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
    const sansId = await enAttente(null);
    await enFile(sansId);
    expect(await tour(client)).toMatchObject({ resultat: "echec" });

    expect(appels).toBe(0);
    const t = await db.pool.query("select derniere_erreur from public.taches order by ordre");
    expect(t.rows.map((x) => x.derniere_erreur)).toEqual(["400 deja_en_relation", "400 identifiant_invitation_inconnu"]);
  });

  it("refus 422 : échec de cette seule tâche, sans gel ; 429 : gel du seul retrait", async () => {
    const id = await enAttente();
    await enFile(id);
    const refus = (status: number): ClientLinkedIn => ({ ...creerClientSimule(), retirerInvitation: async () => ({ ok: false, erreur: { status } }) });
    expect(await tour(refus(422))).toMatchObject({ resultat: "echec" });
    const gels = async () => (await db.pool.query("select type_quota from public.quotas where gel_jusqu_a is not null order by 1")).rows.map((x) => x.type_quota);
    expect(await gels()).toEqual([]);

    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
    const autre = await enAttente();
    await enFile(autre);
    expect(await tour(refus(429))).toMatchObject({ resultat: "gel" });
    expect(await gels()).toEqual(["retrait_invitation"]);
    await db.pool.query("update public.quotas set gel_jusqu_a = null");
  });

  it("annulable tant qu'il n'est pas parti", async () => {
    const id = await enAttente();
    const tache = await enFile(id);
    expect(await annulerTache(db.pool, tache)).toBe(true);
    let appels = 0;
    const client: ClientLinkedIn = { ...creerClientSimule(), retirerInvitation: async () => (appels++, { ok: true, donnees: { dejaDisparue: false } }) };
    expect(await tour(client)).toMatchObject({ statut: "rien_a_faire" });
    expect(appels).toBe(0);
    expect((await etat(id)).prospect).toEqual({ statut_relation: "en_attente", etape: "invitation_envoyee" });
  });
});
