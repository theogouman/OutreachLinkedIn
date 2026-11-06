import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import {
  executerUnTour,
  type ExecuteurLinkedIn,
  type ResultatAppel,
  type TacheAExecuter,
} from "@/server/queue/worker";

// Jeudi 5 novembre 2026, 10h00 à Paris.
const JEUDI_10H = new Date("2026-11-05T09:00:00Z");
const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

/** Faux Unipile : enregistre chaque appel, répond selon un script. */
function fauxUnipile(reponses: (t: TacheAExecuter) => ResultatAppel | Promise<ResultatAppel> = () => ({ ok: true, donnees: {} })) {
  const appels: TacheAExecuter[] = [];
  const executeur: ExecuteurLinkedIn = {
    async executer(t) {
      appels.push(t);
      return reponses(t);
    },
  };
  return { executeur, appels };
}

describe.skipIf(!TEST_DATABASE_URL)("worker de la file d'attente", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());

  beforeEach(async () => {
    await db.pool.query("truncate public.actions, public.taches, public.prospects cascade");
    await db.pool.query(
      "update public.reglages set arret_d_urgence = false, prochaine_action_possible_a = null, delai_min_s = 120, delai_max_s = 360",
    );
    await db.pool.query("update public.quotas set gel_jusqu_a = null");
    await db.pool.query("update public.quotas set plafond_jour = 20, plafond_semaine = 100 where type_quota = 'invitation'");
  });

  async function prospect(nom: string): Promise<string> {
    const r = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, nom) values ($1, $2, $3) returning id",
      [`https://linkedin.com/in/${nom}`, `linkedin.com/in/${nom}`, nom],
    );
    return r.rows[0].id;
  }

  async function tache(type: string, prospectId: string | null = null, extra: { avecNote?: boolean; texte?: string } = {}) {
    const r = await db.pool.query(
      `insert into public.taches (type_action, prospect_id, avec_note, payload, cle_idempotence, executer_apres)
       values ($1, $2, $3, $4, gen_random_uuid()::text, '2026-11-01T00:00:00Z') returning id`,
      [type, prospectId, extra.avecNote ?? false, { texte: extra.texte ?? null }],
    );
    return r.rows[0].id as string;
  }

  async function actionsPassees(type: string, n: number, quand: Date, avecNote = false) {
    for (let i = 0; i < n; i++) {
      await db.pool.query(
        "insert into public.actions (type, sortante, avec_note, resultat, created_at) values ($1, true, $2, 'succes', $3)",
        [type, avecNote, quand],
      );
    }
  }

  const statut = async (id: string) =>
    (await db.pool.query("select statut, motif_attente, depart_estime from public.taches where id = $1", [id])).rows[0];

  /** Tour à l'instant donné, sans espacement résiduel (pour tester une règle à la fois). */
  async function tour(quand: Date, executeur: ExecuteurLinkedIn) {
    return executerUnTour({ pool: db.pool, executeur, maintenant: () => quand, aleatoire: () => 0 });
  }

  it("exécute une tâche, la journalise et fixe le délai avant la suivante", async () => {
    const id = await tache("lecture_liste");
    const { executeur, appels } = fauxUnipile();
    expect(await tour(JEUDI_10H, executeur)).toEqual({ statut: "execute", tacheId: id, resultat: "succes" });
    expect(appels).toHaveLength(1);
    expect((await statut(id)).statut).toBe("faite");
    const reg = await db.pool.query("select prochaine_action_possible_a from public.reglages");
    expect(reg.rows[0].prochaine_action_possible_a).toEqual(minutes(JEUDI_10H, 2));
    const act = await db.pool.query("select resultat from public.actions where tache_id = $1", [id]);
    expect(act.rows).toEqual([{ resultat: "succes" }]);
  });

  it("une seule action par tour, et l'espacement est respecté", async () => {
    await tache("lecture_liste");
    await tache("lecture_liste");
    const { executeur, appels } = fauxUnipile();
    await tour(JEUDI_10H, executeur);
    expect(await tour(minutes(JEUDI_10H, 1), executeur)).toMatchObject({ statut: "rien_a_faire", motif: "espacement" });
    expect(appels).toHaveLength(1);
    await tour(minutes(JEUDI_10H, 2), executeur);
    expect(appels).toHaveLength(2);
  });

  describe("plafonds", () => {
    it("ne dépasse jamais le plafond du jour", async () => {
      await actionsPassees("invitation", 20, minutes(JEUDI_10H, -30));
      const id = await tache("invitation", await prospect("a"));
      const { executeur, appels } = fauxUnipile();
      expect(await tour(JEUDI_10H, executeur)).toMatchObject({ statut: "rien_a_faire", motif: "quota_jour" });
      expect(appels).toHaveLength(0);
      const s = await statut(id);
      expect(s).toMatchObject({ statut: "en_attente", motif_attente: "quota_jour" });
      expect(s.depart_estime).toEqual(new Date("2026-11-06T08:00:00Z"));
    });

    it("une tâche bloquée par le quota reste en file et part au créneau suivant", async () => {
      await actionsPassees("invitation", 20, minutes(JEUDI_10H, -30));
      const id = await tache("invitation", await prospect("b"));
      const { executeur, appels } = fauxUnipile();
      await tour(JEUDI_10H, executeur);
      expect(appels).toHaveLength(0);
      // Vendredi 9h00 Paris : nouveau jour, nouveau quota.
      expect(await tour(new Date("2026-11-06T08:00:00Z"), executeur)).toMatchObject({ statut: "execute", tacheId: id });
      expect(appels).toHaveLength(1);
    });

    it("ne dépasse jamais le plafond de la semaine", async () => {
      await actionsPassees("invitation", 100, new Date("2026-11-02T09:00:00Z")); // lundi
      await tache("invitation", await prospect("c"));
      const { executeur, appels } = fauxUnipile();
      expect(await tour(JEUDI_10H, executeur)).toMatchObject({ motif: "quota_semaine" });
      expect(appels).toHaveLength(0);
      // Lundi suivant 9h : nouvelle semaine.
      await tour(new Date("2026-11-09T08:00:00Z"), executeur);
      expect(appels).toHaveLength(1);
    });

    it("compte les tentatives échouées dans le quota", async () => {
      await db.pool.query("update public.quotas set plafond_jour = 1 where type_quota = 'message'");
      await tache("message", await prospect("d"));
      await tache("message", await prospect("e"));
      const { executeur, appels } = fauxUnipile(() => ({ ok: false, erreur: { status: 404 } }));
      await tour(JEUDI_10H, executeur);
      await tour(minutes(JEUDI_10H, 10), executeur);
      expect(appels).toHaveLength(1);
      await db.pool.query("update public.quotas set plafond_jour = 50 where type_quota = 'message'");
    });

    it("le quota mensuel de notes bloque les invitations avec note, pas celles sans note", async () => {
      await actionsPassees("invitation", 4, new Date("2026-11-02T09:00:00Z"), true);
      const avec = await tache("invitation", await prospect("f"), { avecNote: true });
      const sans = await tache("invitation", await prospect("g"));
      const { executeur, appels } = fauxUnipile();
      await tour(JEUDI_10H, executeur);
      expect(appels.map((a) => a.id)).toEqual([sans]);
      expect((await statut(avec)).motif_attente).toBe("quota_mois");
    });
  });

  describe("ordre de départ", () => {
    it("respecte l'ordre de demande", async () => {
      const ids = [await tache("lecture_liste"), await tache("lecture_liste"), await tache("lecture_liste")];
      const { executeur, appels } = fauxUnipile();
      for (let i = 0; i < 3; i++) await tour(minutes(JEUDI_10H, i * 10), executeur);
      expect(appels.map((a) => a.id)).toEqual(ids);
    });

    it("pour un même prospect, une tâche ne part jamais avant la précédente", async () => {
      const p = await prospect("h");
      const autre = await prospect("i");
      // La 1re tâche de p est bloquée (quota invitation épuisé) ; son message attend derrière.
      await actionsPassees("invitation", 20, minutes(JEUDI_10H, -30));
      const inv = await tache("invitation", p);
      const msgP = await tache("message", p, { texte: "bonjour" });
      const msgAutre = await tache("message", autre, { texte: "salut" });
      const { executeur, appels } = fauxUnipile();
      await tour(JEUDI_10H, executeur);
      expect(appels.map((a) => a.id)).toEqual([msgAutre]);
      expect((await statut(msgP)).statut).toBe("en_attente");
      // Le lendemain : l'invitation part d'abord, puis le message.
      await tour(new Date("2026-11-06T08:00:00Z"), executeur);
      await tour(new Date("2026-11-06T08:10:00Z"), executeur);
      expect(appels.map((a) => a.id)).toEqual([msgAutre, inv, msgP]);
    });

    it("une invitation gelée ne bloque pas les messages des autres prospects", async () => {
      await db.pool.query("update public.quotas set gel_jusqu_a = $1 where type_quota = 'invitation'", [minutes(JEUDI_10H, 600)]);
      await tache("invitation", await prospect("j"));
      const msg = await tache("message", await prospect("k"));
      const { executeur, appels } = fauxUnipile();
      await tour(JEUDI_10H, executeur);
      expect(appels.map((a) => a.id)).toEqual([msg]);
    });
  });

  describe("jamais deux fois", () => {
    it("un worker relancé après un plantage ne renvoie pas la tâche interrompue", async () => {
      const id = await tache("message", await prospect("l"), { texte: "bonjour" });
      // 1er tour : le worker « plante » pendant l'appel (la promesse ne se résout jamais).
      const plante = fauxUnipile(() => new Promise<ResultatAppel>(() => {}));
      void tour(JEUDI_10H, plante.executeur);
      await new Promise((r) => setTimeout(r, 100));
      expect(plante.appels).toHaveLength(1);
      expect((await statut(id)).statut).toBe("en_cours");

      // Nouveau worker, verrou encore valide : il ne touche pas à la tâche.
      const sain = fauxUnipile();
      await tour(minutes(JEUDI_10H, 1), sain.executeur);
      // Verrou expiré : la tâche devient « incertaine », jamais relancée.
      await tour(minutes(JEUDI_10H, 10), sain.executeur);
      await tour(minutes(JEUDI_10H, 20), sain.executeur);
      expect(sain.appels).toHaveLength(0);
      expect((await statut(id)).statut).toBe("incertaine");
      const act = await db.pool.query("select resultat from public.actions where tache_id = $1", [id]);
      expect(act.rows).toEqual([{ resultat: "incertain" }]);
    });

    it("une coupure réseau rend la tâche incertaine, sans nouvel envoi", async () => {
      const id = await tache("message", await prospect("m"));
      const { executeur, appels } = fauxUnipile(() => ({ ok: false, erreur: { status: null } }));
      expect(await tour(JEUDI_10H, executeur)).toMatchObject({ resultat: "incertain" });
      await tour(minutes(JEUDI_10H, 10), executeur);
      expect(appels).toHaveLength(1);
      expect((await statut(id)).statut).toBe("incertaine");
    });

    it("une exception de l'exécuteur est traitée comme incertaine", async () => {
      const id = await tache("message", await prospect("n"));
      const executeur: ExecuteurLinkedIn = {
        executer: async () => {
          throw new Error("boom");
        },
      };
      await tour(JEUDI_10H, executeur);
      expect((await statut(id)).statut).toBe("incertaine");
    });

    it("deux tours simultanés : une seule exécution", async () => {
      await tache("lecture_liste");
      await tache("lecture_liste");
      const { executeur, appels } = fauxUnipile(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true, donnees: {} };
      });
      const bilans = await Promise.all([tour(JEUDI_10H, executeur), tour(JEUDI_10H, executeur)]);
      expect(appels).toHaveLength(1);
      expect(bilans.map((b) => b.statut).sort()).toEqual(["execute", expect.stringMatching(/occupe|rien_a_faire/)]);
    });
  });

  describe("gel sur erreur", () => {
    it.each([
      [{ status: 422, type: "cannot_resend_yet" }],
      [{ status: 429, type: "provider/too_many_requests" }],
      [{ status: 500 }],
    ])("%o gèle le type 24 h et garde la tâche en file", async (erreur) => {
      const id = await tache("invitation", await prospect(`gel${erreur.status}`));
      const { executeur, appels } = fauxUnipile(() => ({ ok: false, erreur }));
      expect(await tour(JEUDI_10H, executeur)).toMatchObject({ resultat: "gel" });
      const q = await db.pool.query("select gel_jusqu_a from public.quotas where type_quota = 'invitation'");
      expect(q.rows[0].gel_jusqu_a).toEqual(minutes(JEUDI_10H, 24 * 60));
      expect((await statut(id)).statut).toBe("en_attente");
      // Pendant le gel, rien ne repart.
      await tour(minutes(JEUDI_10H, 60), executeur);
      expect(appels).toHaveLength(1);
      // Après le gel, la même tâche repart.
      await tour(minutes(JEUDI_10H, 24 * 60 + 1), fauxUnipile().executeur);
      expect((await statut(id)).statut).toBe("faite");
    });

    it("limite propre à Unipile : nouvel essai après retry-after, sans gel", async () => {
      const id = await tache("message", await prospect("o"));
      const { executeur } = fauxUnipile(() => ({
        ok: false,
        erreur: { status: 429, type: "api/too_many_requests", retryAfterS: 300 },
      }));
      expect(await tour(JEUDI_10H, executeur)).toMatchObject({ resultat: "reessayer" });
      const q = await db.pool.query("select gel_jusqu_a from public.quotas where type_quota = 'message'");
      expect(q.rows[0].gel_jusqu_a).toBeNull();
      const t = await db.pool.query("select statut, executer_apres from public.taches where id = $1", [id]);
      expect(t.rows[0]).toEqual({ statut: "en_attente", executer_apres: minutes(JEUDI_10H, 5) });
    });
  });

  it("le bouton d'arrêt suspend tout immédiatement, et la reprise relance la file", async () => {
    const id = await tache("lecture_liste");
    await db.pool.query("update public.reglages set arret_d_urgence = true");
    const { executeur, appels } = fauxUnipile();
    expect(await tour(JEUDI_10H, executeur)).toMatchObject({ statut: "rien_a_faire", motif: "arret_d_urgence" });
    expect(appels).toHaveLength(0);
    expect((await statut(id)).statut).toBe("en_attente");
    await db.pool.query("update public.reglages set arret_d_urgence = false");
    await tour(JEUDI_10H, executeur);
    expect(appels).toHaveLength(1);
  });

  it("aucune action hors plage horaire", async () => {
    await tache("lecture_liste");
    const { executeur, appels } = fauxUnipile();
    for (const quand of ["2026-11-05T06:00:00Z", "2026-11-05T11:45:00Z", "2026-11-05T19:00:00Z", "2026-11-07T10:00:00Z"]) {
      expect(await tour(new Date(quand), executeur)).toMatchObject({ statut: "rien_a_faire", motif: "hors_plage" });
    }
    expect(appels).toHaveLength(0);
  });
});
