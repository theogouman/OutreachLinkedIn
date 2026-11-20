import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerAutomatisations } from "@/server/automatisations/moteur";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis } from "@/server/unipile/executeur";
import { annulerTache } from "@/server/mutations";
import { ficheProspectDepuis } from "@/server/donnees";
import { creerClientSimule } from "../fixtures/client-simule";

const JOUR = 86_400_000;
// Vendredi 20 novembre 2026, 11 h à Paris : dans les plages d'activité.
const M = new Date("2026-11-20T10:00:00Z");
const plus = (j: number) => new Date(M.getTime() + j * JOUR);
const bas = () => 0;

describe.skipIf(!TEST_DATABASE_URL)("moteur des automatisations : relance des invitations", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.liens_linkedin, public.prospects, public.suivis_automatisation cascade");
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null, arret_d_urgence = false");
    await db.pool.query(
      `update public.automatisations set active = true,
         reglages = '{"attente_jours": {"min": 21, "max": 28}, "reinvitation_jours": {"min": 21, "max": 25}, "cycles": 2, "plafond_jour": 10}'`,
    );
  });

  /** Prospect en attente, invitation envoyée il y a `jours` jours (identifiant d'invitation connu par défaut). */
  async function enAttente(jours: number, o: { invitationId?: string | null; statut?: string } = {}) {
    const nom = `demo-${randomUUID().slice(0, 8)}`;
    const provider = `ACoDEMO${nom.slice(5)}`;
    const p = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, provider_id, statut_relation, etape, demo)
       values ($1, $2, $3, $4, $5, 'invitation_envoyee', false) returning id`,
      [`https://www.linkedin.com/in/${nom}`, `linkedin.com/in/${nom}`, nom, provider, o.statut ?? "en_attente"],
    );
    if ((o.statut ?? "en_attente") === "en_attente") {
      await db.pool.query(
        "insert into public.liens_linkedin (type, url_normalisee, provider_id, source, invitation_id, date_lien) values ('invitation_envoyee', $1, $2, 'sync', $3, $4)",
        [`linkedin.com/in/${nom}`, provider, o.invitationId === undefined ? `demo-inv-${nom}` : o.invitationId, plus(-jours)],
      );
    }
    return p.rows[0].id as string;
  }
  const suivis = async () =>
    Object.fromEntries(
      (await db.pool.query("select prospect_id, etat, cycle, motif, prochaine_decision_le from public.suivis_automatisation")).rows.map((x) => [
        x.prospect_id,
        x,
      ]),
    );
  const taches = async () =>
    (
      await db.pool.query(
        "select prospect_id, type_action, statut, automatisation_id is not null as auto, payload from public.taches order by ordre",
      )
    ).rows;
  const tour = (quand: Date) =>
    executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(creerClientSimule(), { lireDestinataire: lireDestinataireDepuis(db.pool), maintenant: () => quand }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => quand,
      aleatoire: bas,
    }).finally(() => db.pool.query("update public.reglages set prochaine_action_possible_a = null"));

  it("en pause : rien n'est suivi ni mis en file", async () => {
    await db.pool.query("update public.automatisations set active = false");
    await enAttente(40);
    expect(await executerAutomatisations(db.pool, M, bas)).toMatchObject({ statut: "inactive" });
    expect(await suivis()).toEqual({});
    expect(await taches()).toEqual([]);
  });

  it("arrêt d'urgence : rien", async () => {
    await db.pool.query("update public.reglages set arret_d_urgence = true");
    await enAttente(40);
    expect(await executerAutomatisations(db.pool, M, bas)).toMatchObject({ statut: "arret" });
    expect(await taches()).toEqual([]);
  });

  it("suit les invitations en attente ; retrait en file pour les seules assez anciennes ; sans identifiant : motif visible", async () => {
    const ancienne = await enAttente(40);
    const recente = await enAttente(5);
    const sansId = await enAttente(40, { invitationId: null });
    const relation = await enAttente(0, { statut: "en_relation" });
    expect(await executerAutomatisations(db.pool, M, bas)).toMatchObject({ statut: "fait", tachesMisesEnFile: 1 });

    const s = await suivis();
    expect(s[ancienne]).toMatchObject({ etat: "retrait_en_file", cycle: 0 });
    expect(s[recente]).toMatchObject({ etat: "attente_retrait", prochaine_decision_le: plus(16) });
    expect(s[sansId]).toMatchObject({ etat: "attente_retrait", motif: "identifiant_invitation_inconnu" });
    expect(s[relation]).toBeUndefined();
    expect(await taches()).toEqual([
      { prospect_id: ancienne, type_action: "retrait_invitation", statut: "en_attente", auto: true, payload: { prospect_id: ancienne } },
    ]);

    // Deux passages : une seule tâche (jamais deux fois).
    await executerAutomatisations(db.pool, M, bas);
    expect(await taches()).toHaveLength(1);
  });

  it("plafond quotidien : les invitations anciennes sont étalées sur plusieurs jours", async () => {
    await db.pool.query("update public.automatisations set reglages = jsonb_set(reglages, '{plafond_jour}', '3')");
    for (let i = 0; i < 5; i++) await enAttente(40 + i);
    expect(await executerAutomatisations(db.pool, M, bas)).toMatchObject({ tachesMisesEnFile: 3, plafondAtteint: true });
    await executerAutomatisations(db.pool, new Date(M.getTime() + 3_600_000), bas);
    expect(await taches()).toHaveLength(3);
    // Le lendemain, la suite.
    expect(await executerAutomatisations(db.pool, plus(1), bas)).toMatchObject({ tachesMisesEnFile: 2 });
    expect(await taches()).toHaveLength(5);
  });

  it("boucle complète par la file : retrait, 21 jours, réinvitation, nouveau cycle ; puis relances épuisées", async () => {
    await db.pool.query("update public.automatisations set reglages = jsonb_set(reglages, '{cycles}', '1')");
    const p = await enAttente(40);
    await executerAutomatisations(db.pool, M, bas);
    expect(await tour(M)).toMatchObject({ resultat: "succes" }); // retrait
    const statut = async () => (await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [p])).rows[0];
    expect(await statut()).toEqual({ statut_relation: "a_inviter", etape: "invitation_envoyee" });

    await executerAutomatisations(db.pool, plus(0.01), bas);
    expect((await suivis())[p]).toMatchObject({ etat: "attente_reinvitation", prochaine_decision_le: plus(21) });
    // Fiche : retrait marqué comme fait par l'automatisation, état de la relance et prochaine date.
    const fiche = await ficheProspectDepuis(db.pool, p, plus(0.01));
    expect(fiche?.historique.find((e) => e.type === "retrait_invitation")).toMatchObject({ resultat: "succes", auto: true });
    expect(fiche?.relance).toEqual({ etat: "attente_reinvitation", prochaineLe: plus(21), cycle: 0 });
    await executerAutomatisations(db.pool, plus(10), bas);
    expect((await taches()).filter((t) => t.type_action === "invitation")).toEqual([]);

    await executerAutomatisations(db.pool, plus(21), bas);
    expect((await taches()).filter((t) => t.type_action === "invitation")).toEqual([
      { prospect_id: p, type_action: "invitation", statut: "en_attente", auto: true, payload: { prospect_id: p } },
    ]);
    expect(await tour(plus(21))).toMatchObject({ resultat: "succes" }); // réinvitation
    expect(await statut()).toMatchObject({ statut_relation: "en_attente" });

    await executerAutomatisations(db.pool, plus(21.01), bas);
    // Un seul cycle réglé : la dernière invitation reste en attente, le prospect est mis de côté.
    expect((await suivis())[p]).toMatchObject({ etat: "mis_de_cote", cycle: 1, motif: "relances_epuisees" });
  });

  it("priorité : une invitation demandée à la main part avant un retrait d'automatisation plus ancien", async () => {
    const auto = await enAttente(40);
    await executerAutomatisations(db.pool, M, bas);
    const manuel = await enAttente(0, { statut: "a_inviter" });
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres) values ('invitation', $1, $2, 'manuel', '2026-11-01')",
      [manuel, { prospect_id: manuel }],
    );
    await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
    await tour(M);
    const t = await taches();
    expect(t.find((x) => x.prospect_id === manuel)?.statut).toBe("faite");
    expect(t.find((x) => x.prospect_id === auto)?.statut).toBe("en_attente");
  });

  it("priorité : une réinvitation d'automatisation plus ancienne passe après une invitation demandée à la main", async () => {
    const auto = await enAttente(0, { statut: "a_inviter" });
    const manuel = await enAttente(0, { statut: "a_inviter" });
    const idAuto = (await db.pool.query("select id from public.automatisations")).rows[0].id;
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres, automatisation_id) values ('invitation', $1, $2, 'auto', '2026-11-01', $3)",
      [auto, { prospect_id: auto }, idAuto],
    );
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres) values ('invitation', $1, $2, 'manuel', '2026-11-01')",
      [manuel, { prospect_id: manuel }],
    );
    await tour(M);
    const t = await taches();
    expect(t.find((x) => x.prospect_id === manuel)?.statut).toBe("faite");
    expect(t.find((x) => x.prospect_id === auto)?.statut).toBe("en_attente");
  });

  it("tâche annulée à la main : retour à l'attente, nouvelle échéance, nouvelle tâche à cette date", async () => {
    const p = await enAttente(40);
    await executerAutomatisations(db.pool, M, bas);
    const id = (await db.pool.query("select id from public.taches where prospect_id = $1", [p])).rows[0].id;
    expect(await annulerTache(db.pool, id)).toBe(true);
    await executerAutomatisations(db.pool, plus(0.01), bas);
    expect((await suivis())[p]).toMatchObject({ etat: "attente_retrait", prochaine_decision_le: plus(21.01) });
    await executerAutomatisations(db.pool, plus(21.01), bas);
    expect((await taches()).map((t) => t.statut)).toEqual(["annulee", "en_attente"]);
  });

  it("acceptation : la boucle s'arrête, plus rien n'est mis en file", async () => {
    const p = await enAttente(40);
    await executerAutomatisations(db.pool, plus(-30), bas); // suivi ouvert, échéance pas encore venue
    await db.pool.query("update public.prospects set statut_relation = 'en_relation' where id = $1", [p]);
    await executerAutomatisations(db.pool, M, bas);
    expect((await suivis())[p]).toMatchObject({ etat: "termine", motif: "accepte" });
    expect(await taches()).toEqual([]);
  });
});
