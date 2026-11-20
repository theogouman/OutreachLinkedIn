import { MAXIMA, TYPES_QUOTA, type TypeQuota } from "./plafonds";

/*
 * Page Réglages (page maître) : une section par encadré extensible. La section ouverte vit dans
 * l'URL (?section=…), comparée à cette liste fermée ; toute autre valeur est ignorée.
 * Les résumés s'affichent sur l'encadré fermé.
 */

export const SECTIONS_REGLAGES = ["file", "plafonds", "rythme"] as const;
export type SectionReglages = (typeof SECTIONS_REGLAGES)[number];

export function sectionDepuis(valeur: unknown): SectionReglages | null {
  return typeof valeur === "string" && (SECTIONS_REGLAGES as readonly string[]).includes(valeur) ? (valeur as SectionReglages) : null;
}

export const PERIODES = ["jour", "semaine", "mois"] as const;
export type Periode = (typeof PERIODES)[number];

/** Périodes plafonnées pour une action (les autres n'ont pas de sens pour un compte gratuit). */
export function periodesActives(type: TypeQuota): Periode[] {
  return PERIODES.filter((p) => MAXIMA[type][p] !== null);
}

export function resumeFile(enAttente: number, incertaines: number): string {
  const parties: string[] = [];
  if (enAttente > 0) parties.push(`${enAttente} action${enAttente > 1 ? "s" : ""} en attente`);
  if (incertaines > 0) parties.push(`${incertaines} à vérifier`);
  return parties.length ? parties.join(" · ") : "Aucune action en attente";
}

const LIBELLES_COURTS: Record<TypeQuota, string> = {
  invitation: "Invitations",
  note_invitation: "Notes",
  lecture_profil: "Lectures",
  message: "Messages",
  lecture_liste: "Synchros",
  retrait_invitation: "Retraits",
};

export function resumePlafonds(plafonds: Record<TypeQuota, Record<Periode, number | null>>): string {
  return TYPES_QUOTA.flatMap((t) => {
    const valeurs = periodesActives(t)
      .filter((p) => plafonds[t]?.[p] != null)
      .map((p) => `${plafonds[t][p]}/${p}`);
    return valeurs.length ? [`${LIBELLES_COURTS[t]} ${valeurs.join(", ")}`] : [];
  }).join(" · ");
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Jours actifs (1 = lundi … 7 = dimanche), les suites de trois jours ou plus regroupées. */
function jours(liste: number[]): string {
  const tries = [...new Set(liste)].filter((j) => j >= 1 && j <= 7).sort((a, b) => a - b);
  const groupes: number[][] = [];
  for (const j of tries) {
    const dernier = groupes.at(-1);
    if (dernier && j === dernier.at(-1)! + 1) dernier.push(j);
    else groupes.push([j]);
  }
  return groupes
    .flatMap((g) => (g.length >= 3 ? [`${JOURS[g[0] - 1]}–${JOURS[g.at(-1)! - 1]}`] : g.map((j) => JOURS[j - 1])))
    .join(", ");
}

export function resumeRythme(plages: { jours: number[]; creneaux: { debut: string; fin: string }[] }): string {
  const j = jours(plages.jours);
  if (!j) return "Aucun jour actif";
  const creneaux = plages.creneaux.map((c) => `${c.debut}–${c.fin}`).join(", ");
  return creneaux ? `${j} · ${creneaux}` : j;
}
