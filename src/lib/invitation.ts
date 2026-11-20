/** Note jointe à une invitation : 200 caractères au plus (limite LinkedIn d'un compte gratuit). */
export const NOTE_INVITATION_MAX = 200;

/**
 * LinkedIn refuse une nouvelle invitation à la même personne pendant 3 semaines après un retrait
 * (refus « already handled a request from you in the past 3 weeks », constaté le 2026-11-19).
 */
export const DELAI_REINVITATION_JOURS = 21;
const JOUR_MS = 86_400_000;

/** Date à partir de laquelle une nouvelle invitation est possible ; null si rien ne l'empêche. */
export function reinvitationPossibleLe(retireeLe: Date | null, maintenant: Date): Date | null {
  if (!retireeLe) return null;
  const possible = new Date(retireeLe.getTime() + DELAI_REINVITATION_JOURS * JOUR_MS);
  return possible.getTime() > maintenant.getTime() ? possible : null;
}

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export function messageReinvitationTropTot(possibleLe: Date): string {
  return `LinkedIn refuse une nouvelle invitation à cette personne avant le ${fmtJour.format(possibleLe)}, trois semaines après le retrait de la précédente.`;
}
