/**
 * Calculs de dates en heure locale (Europe/Paris par défaut) sans dépendance :
 * débuts de jour / semaine / mois pour les quotas, plages horaires d'activité.
 * Les changements d'heure (été / hiver) sont gérés via Intl.
 */

export interface Creneau {
  debut: string; // "HH:MM"
  fin: string; // "HH:MM", exclusif
}

export interface Plages {
  jours: number[]; // 1 = lundi … 7 = dimanche
  creneaux: Creneau[];
}

export interface PartiesLocales {
  annee: number;
  mois: number; // 1-12
  jour: number;
  heure: number;
  minute: number;
  seconde: number;
  jourSemaine: number; // 1 = lundi … 7 = dimanche
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(fuseau: string) {
  let f = formatters.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuseau,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(fuseau, f);
  }
  return f;
}

const JOURS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function partiesLocales(date: Date, fuseau: string): PartiesLocales {
  const p: Record<string, string> = {};
  for (const part of formatter(fuseau).formatToParts(date)) p[part.type] = part.value;
  return {
    annee: Number(p.year),
    mois: Number(p.month),
    jour: Number(p.day),
    heure: Number(p.hour),
    minute: Number(p.minute),
    seconde: Number(p.second),
    jourSemaine: JOURS[p.weekday ?? ""] ?? 0,
  };
}

/** Instant UTC correspondant à une date/heure locale dans le fuseau donné. */
export function instantLocal(
  annee: number,
  mois: number,
  jour: number,
  heure: number,
  minute: number,
  fuseau: string,
): Date {
  const cible = Date.UTC(annee, mois - 1, jour, heure, minute);
  let t = cible;
  // Deux itérations suffisent pour converger, y compris autour d'un changement d'heure.
  for (let i = 0; i < 3; i++) {
    const p = partiesLocales(new Date(t), fuseau);
    const vu = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute);
    const ecart = vu - cible;
    if (ecart === 0) break;
    t -= ecart;
  }
  return new Date(t);
}

/** Ajoute n jours au calendrier local (gère les mois et années). */
function jourDecale(annee: number, mois: number, jour: number, n: number) {
  const d = new Date(Date.UTC(annee, mois - 1, jour + n));
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate() };
}

export function debutJour(date: Date, fuseau: string, decalageJours = 0): Date {
  const p = partiesLocales(date, fuseau);
  const j = jourDecale(p.annee, p.mois, p.jour, decalageJours);
  return instantLocal(j.annee, j.mois, j.jour, 0, 0, fuseau);
}

/** Lundi 00:00 local de la semaine de `date` (+ n semaines). */
export function debutSemaine(date: Date, fuseau: string, decalageSemaines = 0): Date {
  const p = partiesLocales(date, fuseau);
  const j = jourDecale(p.annee, p.mois, p.jour, -(p.jourSemaine - 1) + 7 * decalageSemaines);
  return instantLocal(j.annee, j.mois, j.jour, 0, 0, fuseau);
}

/** 1er du mois 00:00 local (+ n mois). */
export function debutMois(date: Date, fuseau: string, decalageMois = 0): Date {
  const p = partiesLocales(date, fuseau);
  const m = p.mois - 1 + decalageMois;
  const annee = p.annee + Math.floor(m / 12);
  const mois = (((m % 12) + 12) % 12) + 1;
  return instantLocal(annee, mois, 1, 0, 0, fuseau);
}

function minutes(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Heure invalide : ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function dansPlage(date: Date, plages: Plages, fuseau: string): boolean {
  const p = partiesLocales(date, fuseau);
  if (!plages.jours.includes(p.jourSemaine)) return false;
  const m = p.heure * 60 + p.minute;
  return plages.creneaux.some((c) => m >= minutes(c.debut) && m < minutes(c.fin));
}

/**
 * Premier instant ≥ `apres` situé dans une plage autorisée.
 * Renvoie null si aucune plage n'existe dans les 14 prochains jours.
 */
export function prochainDebutPlage(apres: Date, plages: Plages, fuseau: string): Date | null {
  if (dansPlage(apres, plages, fuseau)) return apres;
  const creneaux = [...plages.creneaux].sort((a, b) => minutes(a.debut) - minutes(b.debut));
  for (let n = 0; n <= 14; n++) {
    const jour = debutJour(apres, fuseau, n);
    const p = partiesLocales(jour, fuseau);
    if (!plages.jours.includes(p.jourSemaine)) continue;
    for (const c of creneaux) {
      const debut = minutes(c.debut);
      const instant = instantLocal(p.annee, p.mois, p.jour, Math.floor(debut / 60), debut % 60, fuseau);
      if (instant.getTime() >= apres.getTime()) return instant;
    }
  }
  return null;
}
