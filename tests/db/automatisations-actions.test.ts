import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { automatisationsDepuis } from "@/server/automatisations/lecture";
import { basculerAutomatisation, reglerAutomatisation } from "@/server/mutations";
import { REGLAGES_RELANCE_DEFAUT } from "@/lib/automatisations/catalogue";

// Actions serveur appelées pour de vrai : session et connexion remplacées par des doublures.
const etat = vi.hoisted(() => ({ pool: null as unknown, connecte: true }));
vi.mock("@/server/auth", () => ({
  exigerUtilisateur: async () => {
    if (!etat.connecte) throw new Error("NEXT_REDIRECT /login");
    return { email: "theo@example.com" };
  },
}));
vi.mock("@/server/db", () => ({ poolServeur: () => etat.pool }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

const M = new Date("2026-11-20T10:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("page Workflow : lecture et actions serveur", () => {
  let db: TestDb;
  let id: string;
  beforeAll(async () => {
    db = await createTestDb();
    etat.pool = db.pool;
    id = (await db.pool.query("select id from public.automatisations")).rows[0].id;
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    etat.connecte = true;
    await db.pool.query("truncate public.actions, public.taches, public.prospects, public.suivis_automatisation cascade");
    await db.pool.query("update public.automatisations set active = false, active_le = null, reglages = $1", [REGLAGES_RELANCE_DEFAUT]);
  });

  it("lecture : état, réglages, compteurs par étape, prochaines actions (dates à venir d'abord)", async () => {
    const p = async (nom: string) =>
      (
        await db.pool.query(
          "insert into public.prospects (linkedin_url, url_normalisee, prenom, nom, statut_relation) values ($1, $1, $2, 'Martin', 'en_attente') returning id",
          [`linkedin.com/in/${nom}`, nom],
        )
      ).rows[0].id as string;
    const suivre = (prospect: string, etat: string, prochaine: string | null) =>
      db.pool.query(
        "insert into public.suivis_automatisation (automatisation_id, prospect_id, etat, invitation_envoyee_le, prochaine_decision_le) values ($1, $2, $3, '2026-10-01', $4)",
        [id, prospect, etat, prochaine],
      );
    await suivre(await p("lea"), "attente_retrait", "2026-11-25T10:00:00Z");
    await suivre(await p("tom"), "attente_reinvitation", "2026-11-22T10:00:00Z");
    await suivre(await p("max"), "mis_de_cote", null);

    const [a] = await automatisationsDepuis(db.pool, M);
    expect(a).toMatchObject({
      id,
      code: "relance_invitations",
      nom: "Relance des invitations en attente",
      active: false,
      reglages: REGLAGES_RELANCE_DEFAUT,
      compteurs: { attente_retrait: 1, retrait_en_file: 0, attente_reinvitation: 1, reinvitation_en_file: 0, mis_de_cote: 1, termine: 0 },
      aujourdhui: { misEnFile: 0, plafond: 10 },
    });
    expect(a!.prochaines.map((x) => [x.nom, x.action])).toEqual([
      ["tom Martin", "invitation"],
      ["lea Martin", "retrait"],
    ]);
  });

  it("basculer : active (date d'activation), puis met en pause ; entrée invalide refusée", async () => {
    await basculerAutomatisation(db.pool, { id, active: true }, M);
    expect((await db.pool.query("select active, active_le from public.automatisations")).rows[0]).toEqual({ active: true, active_le: M });
    await basculerAutomatisation(db.pool, { id, active: false }, M);
    expect((await db.pool.query("select active from public.automatisations")).rows[0].active).toBe(false);
    await expect(basculerAutomatisation(db.pool, { id: "pas-un-uuid", active: true }, M)).rejects.toThrow();
    await expect(basculerAutomatisation(db.pool, { id, active: "oui" }, M)).rejects.toThrow();
  });

  it("régler : réglages bornés enregistrés ; hors bornes, clé inconnue ou automatisation inconnue refusés", async () => {
    const nouveaux = { ...REGLAGES_RELANCE_DEFAUT, cycles: null, plafond_jour: 5 };
    await reglerAutomatisation(db.pool, { id, reglages: nouveaux });
    expect((await automatisationsDepuis(db.pool, M))[0]!.reglages).toEqual(nouveaux);
    for (const reglages of [
      { ...REGLAGES_RELANCE_DEFAUT, reinvitation_jours: { min: 10, max: 25 } },
      { ...REGLAGES_RELANCE_DEFAUT, plafond_jour: 50 },
      { ...REGLAGES_RELANCE_DEFAUT, pirate: 1 },
    ]) {
      await expect(reglerAutomatisation(db.pool, { id, reglages })).rejects.toThrow();
    }
    await expect(reglerAutomatisation(db.pool, { id: crypto.randomUUID(), reglages: nouveaux })).rejects.toThrow();
    expect((await automatisationsDepuis(db.pool, M))[0]!.reglages).toEqual(nouveaux);
  });

  it("actions serveur : sans session, refusées avant toute écriture ; connecté, message générique en cas d'entrée invalide", async () => {
    const { actionBasculerAutomatisation, actionReglerAutomatisation } = await import("@/app/actions");
    etat.connecte = false;
    await expect(actionBasculerAutomatisation({ id, active: true })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actionReglerAutomatisation({ id, reglages: REGLAGES_RELANCE_DEFAUT })).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await db.pool.query("select active from public.automatisations")).rows[0].active).toBe(false);

    etat.connecte = true;
    expect(await actionBasculerAutomatisation({ id, active: true })).toMatchObject({ ok: true });
    expect(await actionReglerAutomatisation({ id, reglages: { plafond_jour: 99 } })).toEqual({ ok: false, message: "Valeurs invalides." });
  });
});
