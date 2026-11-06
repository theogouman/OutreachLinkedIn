import Papa from "papaparse";
import { z } from "zod";
import { normaliserUrlLinkedIn } from "@/lib/linkedin-url";

/**
 * Lecture de « Connections.csv » (archive de données LinkedIn). Donnée non fiable :
 * taille bornée, chaque ligne validée, aucune évaluation de contenu. On ne garde
 * que l'URL normalisée et la date de connexion (RGPD) : ni nom, ni email.
 */
export const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;
export const LIGNES_MAX = 50_000;

export interface RelationCsv {
  urlNormalisee: string;
  date: Date | null;
}

export interface ResultatLecture {
  relations: RelationCsv[];
  lignesLues: number;
  lignesRejetees: number;
}

export class ErreurImport extends Error {}

const MOIS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "06 Nov 2026" → Date (UTC, minuit). Format de l'archive LinkedIn. */
export function lireDateLinkedIn(valeur: string | undefined): Date | null {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec((valeur ?? "").trim());
  if (!m) return null;
  const mois = MOIS[m[2]!.toLowerCase()];
  if (mois === undefined) return null;
  const d = new Date(Date.UTC(Number(m[3]), mois, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

const ligneSchema = z.object({ URL: z.string().max(500), "Connected On": z.string().max(40).optional() });

export function lireConnectionsCsv(texte: string): ResultatLecture {
  if (new TextEncoder().encode(texte).length > TAILLE_MAX_OCTETS) {
    throw new ErreurImport("Fichier trop volumineux (5 Mo maximum).");
  }
  // L'archive commence par quelques lignes de notes avant l'en-tête.
  const lignes = texte.replace(/^﻿/, "").split(/\r?\n/);
  const debut = lignes.findIndex((l) => /^"?First Name"?,/i.test(l.trim()));
  if (debut === -1) {
    throw new ErreurImport("En-tête introuvable : ce n'est pas le fichier Connections.csv de l'archive LinkedIn.");
  }

  const parse = Papa.parse<Record<string, string>>(lignes.slice(debut).join("\n"), {
    header: true,
    skipEmptyLines: true,
    preview: LIGNES_MAX + 1,
  });
  if (parse.data.length > LIGNES_MAX) throw new ErreurImport(`Trop de lignes (${LIGNES_MAX} maximum).`);
  if (!parse.meta.fields?.includes("URL")) throw new ErreurImport("Colonne « URL » absente.");

  const parUrl = new Map<string, RelationCsv>();
  let rejetees = 0;
  for (const brute of parse.data) {
    const ligne = ligneSchema.safeParse(brute);
    const profil = ligne.success ? normaliserUrlLinkedIn(ligne.data.URL) : null;
    if (!ligne.success || !profil) {
      rejetees++;
      continue;
    }
    parUrl.set(profil.urlNormalisee, { urlNormalisee: profil.urlNormalisee, date: lireDateLinkedIn(ligne.data["Connected On"]) });
  }
  return { relations: [...parUrl.values()], lignesLues: parse.data.length, lignesRejetees: rejetees };
}
