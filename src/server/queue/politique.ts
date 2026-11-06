/**
 * Règles de décision du worker. Fonctions pures : aucune base, aucun réseau.
 *
 * Une tâche ne part que si TOUTES les conditions sont réunies :
 * pas d'arrêt d'urgence, dans une plage horaire, espacement écoulé, type d'action
 * non gelé, quotas jour / semaine / mois non atteints. Sinon elle reste en file
 * avec un motif et une heure de nouvel essai : rien n'est refusé ni supprimé.
 */
import { debutJour, debutMois, debutSemaine, prochainDebutPlage, dansPlage, type Plages } from "./temps";

export type TypeAction = "invitation" | "message" | "lecture_profil" | "lecture_liste";
export type TypeQuota = TypeAction | "note_invitation";

export interface Plafond {
  jour: number | null;
  semaine: number | null;
  mois: number | null;
}

export interface Compteurs {
  jour: number;
  semaine: number;
  mois: number;
}

export interface EtatQuota {
  plafond: Plafond;
  gelJusqua: Date | null;
}

export interface ReglagesDecision {
  fuseau: string;
  plages: Plages;
  arretDurgence: boolean;
  prochaineActionPossibleA: Date | null;
}

export interface ContexteDecision {
  maintenant: Date;
  reglages: ReglagesDecision;
  quotas: Record<TypeQuota, EtatQuota>;
  compteurs: Record<TypeQuota, Compteurs>;
}

export interface TacheCandidate {
  id: string;
  typeAction: TypeAction;
  avecNote: boolean;
}

export type Motif =
  | "arret_d_urgence"
  | "aucune_plage"
  | "hors_plage"
  | "espacement"
  | "gel"
  | "quota_jour"
  | "quota_semaine"
  | "quota_mois";

export type Decision =
  | { autorise: true }
  | { autorise: false; motif: Motif; quota?: TypeQuota; reessayerA: Date | null };

/** Quotas consommés par une tâche : une invitation avec note compte aussi dans les notes. */
export function quotasConcernes(tache: Pick<TacheCandidate, "typeAction" | "avecNote">): TypeQuota[] {
  return tache.typeAction === "invitation" && tache.avecNote ? ["invitation", "note_invitation"] : [tache.typeAction];
}

/** Conditions communes à toutes les tâches. */
export function verifierConditionsGlobales(ctx: ContexteDecision): Decision {
  const { maintenant, reglages } = ctx;
  if (reglages.arretDurgence) return { autorise: false, motif: "arret_d_urgence", reessayerA: null };

  if (!dansPlage(maintenant, reglages.plages, reglages.fuseau)) {
    const prochain = prochainDebutPlage(maintenant, reglages.plages, reglages.fuseau);
    return prochain
      ? { autorise: false, motif: "hors_plage", reessayerA: prochain }
      : { autorise: false, motif: "aucune_plage", reessayerA: null };
  }

  const possible = reglages.prochaineActionPossibleA;
  if (possible && maintenant.getTime() < possible.getTime()) {
    return { autorise: false, motif: "espacement", reessayerA: possible };
  }
  return { autorise: true };
}

function dansProchainePlage(instant: Date, ctx: ContexteDecision): Date | null {
  return prochainDebutPlage(instant, ctx.reglages.plages, ctx.reglages.fuseau);
}

/** Gel et quotas propres au type de la tâche. */
export function verifierQuotas(tache: Pick<TacheCandidate, "typeAction" | "avecNote">, ctx: ContexteDecision): Decision {
  const { maintenant, reglages } = ctx;
  const tz = reglages.fuseau;

  // Le gel porte sur le type d'action (pas sur le quota de notes).
  const gel = ctx.quotas[tache.typeAction].gelJusqua;
  if (gel && maintenant.getTime() < gel.getTime()) {
    return { autorise: false, motif: "gel", quota: tache.typeAction, reessayerA: dansProchainePlage(gel, ctx) };
  }

  for (const q of quotasConcernes(tache)) {
    const { plafond } = ctx.quotas[q];
    const c = ctx.compteurs[q];
    if (plafond.jour !== null && c.jour >= plafond.jour) {
      return { autorise: false, motif: "quota_jour", quota: q, reessayerA: dansProchainePlage(debutJour(maintenant, tz, 1), ctx) };
    }
    if (plafond.semaine !== null && c.semaine >= plafond.semaine) {
      return {
        autorise: false,
        motif: "quota_semaine",
        quota: q,
        reessayerA: dansProchainePlage(debutSemaine(maintenant, tz, 1), ctx),
      };
    }
    if (plafond.mois !== null && c.mois >= plafond.mois) {
      return { autorise: false, motif: "quota_mois", quota: q, reessayerA: dansProchainePlage(debutMois(maintenant, tz, 1), ctx) };
    }
  }
  return { autorise: true };
}

export function peutExecuter(tache: TacheCandidate, ctx: ContexteDecision): Decision {
  const globale = verifierConditionsGlobales(ctx);
  if (!globale.autorise) return globale;
  return verifierQuotas(tache, ctx);
}

export interface Choix {
  tache: TacheCandidate | null;
  /** Motif d'attente de chaque candidate non retenue (pour la vue File d'attente). */
  attentes: Map<string, Extract<Decision, { autorise: false }>>;
}

/**
 * Choisit la première candidate exécutable. Les candidates arrivent déjà triées
 * par ordre de demande et filtrées (une seule par prospect : la plus ancienne).
 * Une candidate bloquée par son quota ne bloque pas les autres types.
 */
export function choisirTache(candidates: TacheCandidate[], ctx: ContexteDecision): Choix {
  const attentes: Choix["attentes"] = new Map();
  const globale = verifierConditionsGlobales(ctx);
  if (!globale.autorise) {
    for (const t of candidates) attentes.set(t.id, globale);
    return { tache: null, attentes };
  }
  for (const t of candidates) {
    const d = verifierQuotas(t, ctx);
    if (d.autorise) return { tache: t, attentes };
    attentes.set(t.id, d);
  }
  return { tache: null, attentes };
}

/** Délai aléatoire avant la prochaine action sortante, en secondes. */
export function tirerDelai(minS: number, maxS: number, aleatoire: () => number = Math.random): number {
  if (minS > maxS) throw new Error("delai_min_s doit être ≤ delai_max_s");
  return Math.round(minS + aleatoire() * (maxS - minS));
}

// ─── Erreurs Unipile / LinkedIn ───────────────────────────────────────────────

export type IssueErreur =
  /**
   * Gel du type d'action 24 h. La tâche reste en file, sauf si l'envoi a pu partir
   * (`incertain`) : elle passe alors « incertaine » et n'est jamais renvoyée seule.
   */
  | { genre: "gel"; duree_ms: number; incertain: boolean }
  /** Limite propre à Unipile : on réessaie plus tard, sans gel. */
  | { genre: "reessayer"; apres_ms: number }
  /** Demande invalide (404, 400…) : la tâche échoue, rien n'est gelé. */
  | { genre: "echec_definitif" }
  /** On ne sait pas si l'action est partie (coupure, délai dépassé) : jamais renvoyée seule. */
  | { genre: "incertain" };

export const GEL_24H_MS = 24 * 60 * 60 * 1000;

export interface ErreurAppel {
  status: number | null; // null = pas de réponse (réseau, délai)
  type?: string; // ex. "provider/too_many_requests", "api/too_many_requests", "cannot_resend_yet"
  retryAfterS?: number | null;
  /** Détail renvoyé par Unipile (journalisé tel quel, tronqué). */
  detail?: string;
}

/** Actions qui modifient quelque chose chez LinkedIn : un doublon serait visible du prospect. */
export function estUnEnvoi(type: TypeAction): boolean {
  return type === "invitation" || type === "message";
}

export function classerErreur(e: ErreurAppel, type: TypeAction = "lecture_liste"): IssueErreur {
  if (e.status === null) return { genre: "incertain" };
  if (e.status === 429 && e.type === "api/too_many_requests") {
    const s = e.retryAfterS && e.retryAfterS > 0 ? e.retryAfterS : 60;
    return { genre: "reessayer", apres_ms: s * 1000 };
  }
  // 5xx / délai côté LinkedIn : la demande a pu être traitée malgré l'erreur.
  const peutEtrePartie = e.status >= 500 && estUnEnvoi(type);
  if (e.status === 422 || e.status === 429 || e.status >= 500) {
    return { genre: "gel", duree_ms: GEL_24H_MS, incertain: peutEtrePartie };
  }
  return { genre: "echec_definitif" };
}
