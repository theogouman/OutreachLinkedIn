import Papa from "papaparse";
import { z } from "zod";
import { normaliserUrlLinkedIn } from "@/lib/linkedin-url";
import { ErreurImport, LIGNES_MAX, TAILLE_MAX_OCTETS } from "./connections-csv";

/**
 * Import ponctuel des prospects depuis l'export CSV d'une base Notion (Contacts).
 * Les colonnes sont choisies par l'utilisateur. Donnée non fiable : taille bornée,
 * champs bornés, formules neutralisées, URL LinkedIn obligatoire et normalisée.
 */

export const correspondanceSchema = z.object({
  url: z.string().min(1).max(200),
  nomComplet: z.string().max(200).optional(),
  prenom: z.string().max(200).optional(),
  nom: z.string().max(200).optional(),
  poste: z.string().max(200).optional(),
  entreprise: z.string().max(200).optional(),
});
export type Correspondance = z.infer<typeof correspondanceSchema>;

export interface ProspectCsv {
  linkedinUrl: string;
  urlNormalisee: string;
  publicIdentifier: string;
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  entreprise: string | null;
}

/** Retire un préfixe de formule de tableur (=, +, -, @, tabulation, retour chariot). */
export function neutraliserFormule(valeur: string): string {
  return valeur.replace(/^[=+\-@\t\r\s]+/, "");
}

function champ(valeur: unknown, max = 200): string | null {
  if (typeof valeur !== "string") return null;
  const v = neutraliserFormule(valeur.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, max).trim();
  return v || null;
}

function parser(texte: string) {
  if (new TextEncoder().encode(texte).length > TAILLE_MAX_OCTETS) {
    throw new ErreurImport("Fichier trop volumineux (5 Mo maximum).");
  }
  const parse = Papa.parse<Record<string, string>>(texte.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    preview: LIGNES_MAX + 1,
  });
  if (parse.data.length > LIGNES_MAX) throw new ErreurImport(`Trop de lignes (${LIGNES_MAX} maximum).`);
  const colonnes = parse.meta.fields ?? [];
  if (colonnes.length === 0) throw new ErreurImport("Aucune colonne trouvée.");
  return { lignes: parse.data, colonnes };
}

export function lireColonnes(texte: string): string[] {
  return parser(texte).colonnes;
}

export function lireProspectsCsv(texte: string, correspondance: Correspondance) {
  const { lignes, colonnes } = parser(texte);
  for (const col of Object.values(correspondance)) {
    if (col && !colonnes.includes(col)) throw new ErreurImport(`Colonne « ${col.slice(0, 50)} » absente du fichier.`);
  }

  const parUrl = new Map<string, ProspectCsv>();
  let rejetees = 0;
  for (const ligne of lignes) {
    const profil = normaliserUrlLinkedIn(ligne[correspondance.url]);
    if (!profil) {
      rejetees++;
      continue;
    }
    let prenom = correspondance.prenom ? champ(ligne[correspondance.prenom]) : null;
    let nom = correspondance.nom ? champ(ligne[correspondance.nom]) : null;
    if (correspondance.nomComplet && !prenom && !nom) {
      const complet = champ(ligne[correspondance.nomComplet]);
      if (complet) {
        const [premier, ...reste] = complet.split(/\s+/);
        prenom = premier ?? null;
        nom = reste.join(" ") || null;
      }
    }
    parUrl.set(profil.urlNormalisee, {
      linkedinUrl: `https://www.${profil.urlNormalisee}`,
      urlNormalisee: profil.urlNormalisee,
      publicIdentifier: profil.publicIdentifier,
      prenom,
      nom,
      poste: correspondance.poste ? champ(ligne[correspondance.poste]) : null,
      entreprise: correspondance.entreprise ? champ(ligne[correspondance.entreprise]) : null,
    });
  }
  return { prospects: [...parUrl.values()], lignesLues: lignes.length, lignesRejetees: rejetees };
}
