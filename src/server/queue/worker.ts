/**
 * Worker de la file d'attente. Un « tour » = au plus une action sortante.
 *
 * Garanties :
 * - un seul tour actif à la fois (verrou consultatif Postgres) ;
 * - quotas, plages, gel, arrêt et espacement vérifiés au moment de l'exécution ;
 * - la tentative est journalisée AVANT l'appel : elle compte dans les quotas même
 *   si l'appel échoue ou si le worker plante ;
 * - jamais deux fois : une tâche interrompue en cours d'envoi passe « incertaine »
 *   et n'est jamais relancée automatiquement ;
 * - rien n'est perdu : quota, gel ou limite Unipile laissent la tâche en file.
 */
import type { Pool, PoolClient } from "pg";
import {
  choisirTache,
  classerErreur,
  tirerDelai,
  type ContexteDecision,
  type ErreurAppel,
  type TacheCandidate,
  type TypeAction,
  type TypeQuota,
} from "./politique";
import { debutJour, debutMois, debutSemaine, type Plages } from "./temps";

/** Durée de réservation d'une tâche. L'appel Unipile doit se terminer bien avant. */
export const DUREE_VERROU_MS = 2 * 60 * 1000;
const CLE_VERROU_WORKER = 727_001;

export interface TacheAExecuter {
  id: string;
  typeAction: TypeAction;
  avecNote: boolean;
  prospectId: string | null;
  payload: Record<string, unknown>;
}

export type ResultatAppel = { ok: true; donnees: unknown } | { ok: false; erreur: ErreurAppel };

export interface ExecuteurLinkedIn {
  executer(tache: TacheAExecuter): Promise<ResultatAppel>;
}

/** Effets en base d'une action réussie (statut, provider_id, étape…). Même transaction que la clôture. */
export type AppliquerEffets = (client: PoolClient, tache: TacheAExecuter, donnees: unknown) => Promise<void>;

export interface OptionsTour {
  pool: Pool;
  executeur: ExecuteurLinkedIn;
  appliquerEffets?: AppliquerEffets;
  maintenant?: () => Date;
  aleatoire?: () => number;
}

export type BilanTour =
  | { statut: "occupe" }
  | { statut: "rien_a_faire"; motif?: string }
  | { statut: "execute"; tacheId: string; resultat: "succes" | "gel" | "reessayer" | "echec" | "incertain" };

async function dansTransaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const TYPES_QUOTA: TypeQuota[] = ["invitation", "note_invitation", "lecture_profil", "message", "lecture_liste"];

/** Réglages, plafonds, gels et compteurs du moment (aussi utilisé par la jauge de quotas). */
export async function chargerContexte(c: PoolClient | Pool, maintenant: Date): Promise<ContexteDecision> {
  const r = await c.query(
    "select fuseau, plages, arret_d_urgence, prochaine_action_possible_a from public.reglages where id",
  );
  const reg = r.rows[0];
  const fuseau: string = reg.fuseau;

  const q = await c.query(
    "select type_quota, plafond_jour, plafond_semaine, plafond_mois, gel_jusqu_a from public.quotas",
  );
  const quotas = {} as ContexteDecision["quotas"];
  for (const row of q.rows) {
    quotas[row.type_quota as TypeQuota] = {
      plafond: { jour: row.plafond_jour, semaine: row.plafond_semaine, mois: row.plafond_mois },
      gelJusqua: row.gel_jusqu_a,
    };
  }
  for (const t of TYPES_QUOTA) {
    // Quota absent = configuration cassée : on bloque plutôt que de laisser passer.
    quotas[t] ??= { plafond: { jour: 0, semaine: 0, mois: 0 }, gelJusqua: null };
  }

  const jour = debutJour(maintenant, fuseau);
  const semaine = debutSemaine(maintenant, fuseau);
  const mois = debutMois(maintenant, fuseau);
  const depuis = new Date(Math.min(jour.getTime(), semaine.getTime(), mois.getTime()));
  const cpt = await c.query(
    `select type, avec_note,
            count(*) filter (where created_at >= $1)::int as jour,
            count(*) filter (where created_at >= $2)::int as semaine,
            count(*) filter (where created_at >= $3)::int as mois
       from public.actions
      where sortante and created_at >= $4
      group by type, avec_note`,
    [jour, semaine, mois, depuis],
  );
  const compteurs = Object.fromEntries(TYPES_QUOTA.map((t) => [t, { jour: 0, semaine: 0, mois: 0 }])) as ContexteDecision["compteurs"];
  for (const row of cpt.rows) {
    const cible = compteurs[row.type as TypeQuota];
    cible.jour += row.jour;
    cible.semaine += row.semaine;
    cible.mois += row.mois;
    if (row.type === "invitation" && row.avec_note) {
      compteurs.note_invitation.jour += row.jour;
      compteurs.note_invitation.semaine += row.semaine;
      compteurs.note_invitation.mois += row.mois;
    }
  }

  return {
    maintenant,
    reglages: {
      fuseau,
      plages: reg.plages as Plages,
      arretDurgence: reg.arret_d_urgence,
      prochaineActionPossibleA: reg.prochaine_action_possible_a,
    },
    quotas,
    compteurs,
  };
}

/**
 * Candidates : tâches en attente, échues, dans l'ordre de demande. Pour un même
 * prospect, seule la plus ancienne tâche non terminée est candidate (ordre strict).
 */
async function chargerCandidates(c: PoolClient, maintenant: Date) {
  const r = await c.query(
    `select t.id, t.type_action, t.avec_note, t.prospect_id, t.payload
       from public.taches t
      where t.statut = 'en_attente'
        and t.executer_apres <= $1
        and not exists (
          select 1 from public.taches p
           where t.prospect_id is not null
             and p.prospect_id = t.prospect_id
             and p.ordre < t.ordre
             and p.statut in ('en_attente', 'en_cours', 'incertaine'))
      order by t.ordre
      limit 200`,
    [maintenant],
  );
  return r.rows.map(
    (row): TacheAExecuter => ({
      id: row.id,
      typeAction: row.type_action,
      avecNote: row.avec_note,
      prospectId: row.prospect_id,
      payload: row.payload,
    }),
  );
}

export async function executerUnTour(opts: OptionsTour): Promise<BilanTour> {
  const maintenant = (opts.maintenant ?? (() => new Date()))();
  const aleatoire = opts.aleatoire ?? Math.random;

  // ── 1. Réservation (transaction courte, verrou exclusif du worker) ──
  const reservation = await dansTransaction(opts.pool, async (c) => {
    const lock = await c.query("select pg_try_advisory_xact_lock($1) as ok", [CLE_VERROU_WORKER]);
    if (!lock.rows[0].ok) return { statut: "occupe" as const };

    // Tâches dont le verrou a expiré : l'envoi a pu partir. Jamais relancées seules.
    const perdues = await c.query(
      `update public.taches
          set statut = 'incertaine', motif_attente = 'interrompue', verrou_jusqu_a = null, updated_at = $1
        where statut = 'en_cours' and verrou_jusqu_a < $1
        returning id`,
      [maintenant],
    );
    if (perdues.rowCount) {
      await c.query(
        "update public.actions set resultat = 'incertain' where resultat = 'en_cours' and tache_id = any($1)",
        [perdues.rows.map((r) => r.id)],
      );
    }

    const ctx = await chargerContexte(c, maintenant);
    const candidates = await chargerCandidates(c, maintenant);
    const parId = new Map(candidates.map((t) => [t.id, t]));
    const choix = choisirTache(
      candidates.map((t): TacheCandidate => ({ id: t.id, typeAction: t.typeAction, avecNote: t.avecNote })),
      ctx,
    );

    for (const [id, d] of choix.attentes) {
      await c.query("update public.taches set motif_attente = $2, depart_estime = $3 where id = $1", [
        id,
        d.motif,
        d.reessayerA,
      ]);
    }
    if (!choix.tache) {
      const premier = choix.attentes.values().next().value;
      return { statut: "rien_a_faire" as const, motif: premier?.motif };
    }

    const tache = parId.get(choix.tache.id)!;
    await c.query(
      `update public.taches
          set statut = 'en_cours', verrou_jusqu_a = $2, tentatives = tentatives + 1,
              motif_attente = null, depart_estime = null, updated_at = $3
        where id = $1`,
      [tache.id, new Date(maintenant.getTime() + DUREE_VERROU_MS), maintenant],
    );
    const action = await c.query(
      `insert into public.actions (prospect_id, tache_id, type, sortante, avec_note, resultat, created_at)
       values ($1, $2, $3, true, $4, 'en_cours', $5) returning id`,
      [tache.prospectId, tache.id, tache.typeAction, tache.avecNote, maintenant],
    );
    const reg = await c.query("select delai_min_s, delai_max_s from public.reglages where id");
    const delai = tirerDelai(reg.rows[0].delai_min_s, reg.rows[0].delai_max_s, aleatoire);
    await c.query("update public.reglages set prochaine_action_possible_a = $1 where id", [
      new Date(maintenant.getTime() + delai * 1000),
    ]);
    return { statut: "reserve" as const, tache, actionId: action.rows[0].id as string };
  });

  if (reservation.statut !== "reserve") return reservation;
  const { tache, actionId } = reservation;

  // ── 2. Appel LinkedIn (hors transaction) ──
  let resultat: ResultatAppel;
  try {
    resultat = await opts.executeur.executer(tache);
  } catch {
    // Exception inattendue : on ne sait pas si l'action est partie.
    resultat = { ok: false, erreur: { status: null } };
  }

  // ── 3. Clôture ──
  const fin = (opts.maintenant ?? (() => new Date()))();
  return dansTransaction(opts.pool, async (c) => {
    if (resultat.ok) {
      await c.query("update public.actions set resultat = 'succes' where id = $1", [actionId]);
      await c.query(
        "update public.taches set statut = 'faite', verrou_jusqu_a = null, derniere_erreur = null, updated_at = $2 where id = $1",
        [tache.id, fin],
      );
      if (opts.appliquerEffets) await opts.appliquerEffets(c, tache, resultat.donnees);
      return { statut: "execute" as const, tacheId: tache.id, resultat: "succes" as const };
    }

    const erreur = resultat.erreur;
    const code = [erreur.status ?? "sans_reponse", erreur.type].filter(Boolean).join(" ");
    const details = erreur.detail ? { detail: erreur.detail.slice(0, 500) } : {};
    const issue = classerErreur(erreur, tache.typeAction);

    switch (issue.genre) {
      case "gel":
        await c.query("update public.actions set resultat = $3, code_erreur = $2, details = $4 where id = $1", [
          actionId,
          code,
          issue.incertain ? "incertain" : "echec",
          details,
        ]);
        await c.query("update public.quotas set gel_jusqu_a = $2 where type_quota = $1", [
          tache.typeAction,
          new Date(fin.getTime() + issue.duree_ms),
        ]);
        await c.query(
          `update public.taches set statut = $4, verrou_jusqu_a = null, derniere_erreur = $2,
                  motif_attente = $5, updated_at = $3 where id = $1`,
          [tache.id, code, fin, issue.incertain ? "incertaine" : "en_attente", issue.incertain ? "incertaine" : "gel"],
        );
        return { statut: "execute" as const, tacheId: tache.id, resultat: issue.incertain ? ("incertain" as const) : ("gel" as const) };
      case "reessayer":
        await c.query("update public.actions set resultat = 'echec', code_erreur = $2 where id = $1", [actionId, code]);
        await c.query(
          `update public.taches set statut = 'en_attente', verrou_jusqu_a = null, derniere_erreur = $2,
                  executer_apres = $3, updated_at = $4 where id = $1`,
          [tache.id, code, new Date(fin.getTime() + issue.apres_ms), fin],
        );
        return { statut: "execute" as const, tacheId: tache.id, resultat: "reessayer" as const };
      case "echec_definitif":
        await c.query("update public.actions set resultat = 'echec', code_erreur = $2 where id = $1", [actionId, code]);
        await c.query(
          "update public.taches set statut = 'echec', verrou_jusqu_a = null, derniere_erreur = $2, updated_at = $3 where id = $1",
          [tache.id, code, fin],
        );
        return { statut: "execute" as const, tacheId: tache.id, resultat: "echec" as const };
      case "incertain":
        await c.query("update public.actions set resultat = 'incertain', code_erreur = $2 where id = $1", [actionId, code]);
        await c.query(
          `update public.taches set statut = 'incertaine', verrou_jusqu_a = null, derniere_erreur = $2,
                  motif_attente = 'incertaine', updated_at = $3 where id = $1`,
          [tache.id, code, fin],
        );
        return { statut: "execute" as const, tacheId: tache.id, resultat: "incertain" as const };
    }
  });
}
