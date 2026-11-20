/**
 * Relance des invitations en attente (spec 001-workflows) : règles de décision pures, sans base ni
 * réseau (modèle de `queue/politique.ts`), testées avec l'heure et le hasard injectés.
 *
 * Pour un prospect, à partir de son suivi et des faits du moment, `decider` rend le suivi suivant et,
 * s'il le faut, l'action à mettre en file (retrait ou invitation). Transitions : data-model.md.
 * Ce module ne met rien en file lui-même : le moteur applique le plafond quotidien et l'idempotence.
 */
import { DELAI_REINVITATION_JOURS } from "@/lib/invitation";
import type { ReglagesRelance } from "@/lib/automatisations/catalogue";

const JOUR_MS = 86_400_000;
/** Réinvitation refusée ou annulée : nouvel essai une semaine plus tard (jamais le jour même). */
export const REPORT_REINVITATION_JOURS = 7;

export type EtatSuivi = "attente_retrait" | "retrait_en_file" | "attente_reinvitation" | "reinvitation_en_file" | "mis_de_cote" | "termine";

export interface Suivi {
  etat: EtatSuivi;
  /** Cycles retrait + réinvitation terminés. */
  cycle: number;
  prochaineDecisionLe: Date | null;
  invitationEnvoyeeLe: Date;
  retireeLe: Date | null;
  motif: string | null;
}

/** Faits du moment, relus en base à chaque passage. */
export interface Faits {
  statutRelation: "en_relation" | "en_attente" | "invitation_recue" | "a_inviter";
  etapeTerminale: boolean;
  /** Date d'envoi de l'invitation en attente (null : aucune connue). */
  invitationEnvoyeeLe: Date | null;
  /** Identifiant de l'invitation connu (nécessaire au retrait). */
  invitationIdConnu: boolean;
  /** Dernier retrait réussi (règle des 21 jours de LinkedIn). */
  dernierRetraitLe: Date | null;
  /** Tâche de cette automatisation encore en file pour ce prospect. */
  tacheEnFile: "retrait" | "invitation" | null;
}

export interface Decision {
  mettreEnFile: "retrait" | "invitation" | null;
  /** Suivi après décision (null : pas de suivi pour ce prospect). */
  suivi: Suivi | null;
}

const plus = (d: Date, jours: number) => new Date(d.getTime() + jours * JOUR_MS);
const tirer = (p: { min: number; max: number }, aleatoire: () => number) => p.min + aleatoire() * (p.max - p.min);
const rien = (suivi: Suivi | null): Decision => ({ mettreEnFile: null, suivi });

export function decider(existant: Suivi | null, faits: Faits, reglages: ReglagesRelance, maintenant: Date, aleatoire: () => number): Decision {
  // ── Début : toute invitation en attente d'un prospect du CRM ouvre un suivi, puis la décision
  // continue dans le même passage (une invitation déjà ancienne est retirée sans attendre).
  let suivi = existant;
  if (!suivi) {
    if (faits.statutRelation !== "en_attente" || !faits.invitationEnvoyeeLe) return rien(null);
    suivi = {
      etat: "attente_retrait",
      cycle: 0,
      prochaineDecisionLe: plus(faits.invitationEnvoyeeLe, tirer(reglages.attente_jours, aleatoire)),
      invitationEnvoyeeLe: faits.invitationEnvoyeeLe,
      retireeLe: null,
      motif: null,
    };
  }
  if (suivi.etat === "termine") return rien(suivi);

  // ── Sorties de boucle : acceptation, invitation reçue, étape terminale (Gagné, Perdu…).
  const sortie =
    faits.statutRelation === "en_relation"
      ? "accepte"
      : faits.statutRelation === "invitation_recue"
        ? "invitation_recue"
        : faits.etapeTerminale
          ? "etape_terminale"
          : null;
  if (sortie) return rien({ ...suivi, etat: "termine", motif: sortie, prochaineDecisionLe: null });

  const attenteRetraitDepuis = (envoi: Date, cycle: number): Suivi => ({
    etat: "attente_retrait",
    cycle,
    prochaineDecisionLe: plus(envoi, tirer(reglages.attente_jours, aleatoire)),
    invitationEnvoyeeLe: envoi,
    retireeLe: null,
    motif: null,
  });
  const echu = (s: Suivi) => !!s.prochaineDecisionLe && maintenant.getTime() >= s.prochaineDecisionLe.getTime();
  const enAttente = faits.statutRelation === "en_attente" && !!faits.invitationEnvoyeeLe;

  switch (suivi.etat) {
    case "mis_de_cote": {
      // Cycles augmentés depuis : la relance reprend depuis l'invitation en cours.
      const encore = reglages.cycles === null || suivi.cycle < reglages.cycles;
      if (suivi.motif === "relances_epuisees" && encore && enAttente) return rien(attenteRetraitDepuis(faits.invitationEnvoyeeLe!, suivi.cycle));
      return rien(suivi);
    }

    case "attente_retrait": {
      if (faits.statutRelation === "a_inviter") {
        // Invitation disparue d'elle-même (retirée à la main, expirée) : délai de réinvitation depuis le constat.
        return rien({
          ...suivi,
          etat: "attente_reinvitation",
          retireeLe: maintenant,
          prochaineDecisionLe: plus(maintenant, tirer(reglages.reinvitation_jours, aleatoire)),
        });
      }
      if (enAttente && faits.invitationEnvoyeeLe!.getTime() !== suivi.invitationEnvoyeeLe.getTime()) {
        // Nouvelle invitation envoyée entre-temps : l'attente repart de sa date.
        return rien(attenteRetraitDepuis(faits.invitationEnvoyeeLe!, suivi.cycle));
      }
      if (!echu(suivi)) return rien(suivi);
      if (!faits.invitationIdConnu) return rien({ ...suivi, motif: "identifiant_invitation_inconnu" });
      return { mettreEnFile: "retrait", suivi: { ...suivi, etat: "retrait_en_file", motif: null } };
    }

    case "retrait_en_file": {
      if (faits.tacheEnFile) return rien(suivi);
      if (faits.statutRelation === "a_inviter") {
        const retireeLe = faits.dernierRetraitLe ?? maintenant;
        return rien({
          ...suivi,
          etat: "attente_reinvitation",
          retireeLe,
          prochaineDecisionLe: plus(retireeLe, tirer(reglages.reinvitation_jours, aleatoire)),
        });
      }
      // Tâche annulée ou échouée, invitation toujours en attente : nouvelle attente complète.
      return rien({ ...suivi, etat: "attente_retrait", prochaineDecisionLe: plus(maintenant, tirer(reglages.attente_jours, aleatoire)) });
    }

    case "attente_reinvitation": {
      if (enAttente) return rien(apresReinvitation(suivi, faits.invitationEnvoyeeLe!));
      if (!echu(suivi)) return rien(suivi);
      // Jamais avant 21 jours depuis le dernier retrait (règle LinkedIn), quelle que soit l'échéance.
      const base = faits.dernierRetraitLe ?? suivi.retireeLe;
      const possible = base ? plus(base, DELAI_REINVITATION_JOURS) : null;
      if (possible && maintenant.getTime() < possible.getTime()) return rien({ ...suivi, prochaineDecisionLe: possible });
      return { mettreEnFile: "invitation", suivi: { ...suivi, etat: "reinvitation_en_file" } };
    }

    case "reinvitation_en_file": {
      if (faits.tacheEnFile) return rien(suivi);
      if (enAttente) return rien(apresReinvitation(suivi, faits.invitationEnvoyeeLe!));
      // Invitation refusée ou annulée : nouvel essai plus tard, jamais le jour même.
      return rien({ ...suivi, etat: "attente_reinvitation", prochaineDecisionLe: plus(maintenant, REPORT_REINVITATION_JOURS) });
    }
  }

  /** Réinvitation partie : un cycle de plus ; dernier cycle atteint → mis de côté, sinon nouvelle attente. */
  function apresReinvitation(s: Suivi, envoi: Date): Suivi {
    const cycle = s.cycle + 1;
    if (reglages.cycles !== null && cycle >= reglages.cycles) {
      return { etat: "mis_de_cote", cycle, prochaineDecisionLe: null, invitationEnvoyeeLe: envoi, retireeLe: null, motif: "relances_epuisees" };
    }
    return attenteRetraitDepuis(envoi, cycle);
  }
}
