import { z } from "zod";
import { lienSur } from "./listes";

/**
 * Profil LinkedIn d'un prospect (enrichissement externe). Donnée tierce : chaque champ est revalidé
 * à la lecture, textes bornés, liens en https uniquement, e-mail au format simple ; un élément de
 * liste mal formé est ignoré, jamais deviné. Affiché en texte brut (aucun HTML interprété).
 */

// `.optional()` : une clé absente vaut « pas de valeur » (null), pas une erreur.
const texte = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null));
const nombre = z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null));
const lien = z.unknown().optional().transform((v) => lienSur(v));
const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

const experienceSchema = z.object({
  poste: z.string().trim().min(1).max(300),
  entreprise: texte(300),
  periode: texte(120),
  lieu: texte(200),
  description: texte(2000),
  actuel: z.unknown().optional().transform((v) => v === true),
});
const formationSchema = z.object({
  ecole: z.string().trim().min(1).max(300),
  diplome: texte(300),
  domaine: texte(300),
  periode: texte(120),
});
const entrepriseSchema = z.object({
  nom: texte(300),
  secteur: texte(200),
  taille: texte(40),
  siege: texte(200),
  site: lien,
  linkedin: lien,
  creation: nombre,
  type: texte(100),
  description: texte(3000),
});

/** Éléments valides d'une liste, au plus `max`. */
function liste<T extends z.ZodType>(schema: T, max: number) {
  return z.unknown().transform((v) => {
    if (!Array.isArray(v)) return [] as z.output<T>[];
    const sortie: z.output<T>[] = [];
    for (const x of v.slice(0, max)) {
      const r = schema.safeParse(x);
      if (r.success) sortie.push(r.data);
    }
    return sortie;
  });
}

const profilSchema = z.object({
  lu_le: z.unknown().optional().transform((v) => {
    const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }),
  titre: texte(500),
  localisation: texte(200),
  a_propos: texte(5000),
  email: z.unknown().optional().transform((v) => (typeof v === "string" && v.length <= 320 && EMAIL.test(v.trim()) ? v.trim() : null)),
  relations: nombre,
  abonnes: nombre,
  entreprise: z.unknown().optional().transform((v) => {
    const r = entrepriseSchema.safeParse(v ?? {});
    return r.success && Object.values(r.data).some((x) => x !== null) ? r.data : null;
  }),
  experiences: liste(experienceSchema, 30),
  formation: liste(formationSchema, 15),
  avant: z.unknown().optional().transform((v) => {
    const r = z.object({ poste: texte(300), entreprise: texte(300) }).safeParse(v ?? {});
    return r.success && (r.data.poste || r.data.entreprise) ? r.data : null;
  }),
});

export type ProfilLinkedIn = {
  luLe: Date | null;
  titre: string | null;
  localisation: string | null;
  aPropos: string | null;
  email: string | null;
  relations: number | null;
  abonnes: number | null;
  entreprise: z.output<typeof entrepriseSchema> | null;
  experiences: z.output<typeof experienceSchema>[];
  formation: z.output<typeof formationSchema>[];
  avant: { poste: string | null; entreprise: string | null } | null;
};

export function profilAffichable(brut: unknown): ProfilLinkedIn | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const r = profilSchema.safeParse(brut);
  if (!r.success) return null;
  const p = r.data;
  return {
    luLe: p.lu_le,
    titre: p.titre,
    localisation: p.localisation,
    aPropos: p.a_propos,
    email: p.email,
    relations: p.relations,
    abonnes: p.abonnes,
    entreprise: p.entreprise,
    experiences: p.experiences,
    formation: p.formation,
    avant: p.avant,
  };
}
