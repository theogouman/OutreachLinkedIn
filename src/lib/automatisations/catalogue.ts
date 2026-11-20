import { z } from "zod";
import { DELAI_REINVITATION_JOURS } from "@/lib/invitation";

/*
 * Catalogue des automatisations fournies par l'outil (spec 001-workflows). Chacune déclare ses
 * réglages (schéma Zod, mêmes bornes que les contraintes SQL de `automatisations`), leurs valeurs
 * par défaut et son déroulé en modules — descriptif dans cette itération, repris tel quel par
 * l'éditeur d'une itération suivante (FR-030).
 */

export const CODES_AUTOMATISATION = ["relance_invitations"] as const;
export type CodeAutomatisation = (typeof CODES_AUTOMATISATION)[number];

/** Plage de jours [min, max] dans laquelle un délai est tiré au hasard. */
const plage = (min: number, max: number) =>
  z
    .object({ min: z.number().int().min(min).max(max), max: z.number().int().min(min).max(max) })
    .strict()
    .refine((p) => p.min <= p.max, { message: "Le minimum dépasse le maximum." });

export const reglagesRelanceSchema = z
  .object({
    /** Ancienneté d'une invitation en attente avant son retrait. */
    attente_jours: plage(7, 120),
    /** Délai après le retrait avant de réinviter : jamais sous la limite de LinkedIn. */
    reinvitation_jours: plage(DELAI_REINVITATION_JOURS, 90),
    /** Cycles retrait / réinvitation par prospect ; null = sans limite. */
    cycles: z.number().int().min(1).max(10).nullable(),
    /** Actions (retraits et réinvitations) mises en file par jour, au plus. */
    plafond_jour: z.number().int().min(1).max(20),
  })
  .strict();
export type ReglagesRelance = z.infer<typeof reglagesRelanceSchema>;

export const REGLAGES_RELANCE_DEFAUT: ReglagesRelance = {
  attente_jours: { min: 21, max: 28 },
  reinvitation_jours: { min: 21, max: 25 },
  cycles: 2,
  plafond_jour: 10,
};

/** Réglages lus en base : revalidés, sinon remplacés par ceux par défaut (jamais d'erreur à l'affichage). */
export function reglagesAffichables(brut: unknown): ReglagesRelance {
  const r = reglagesRelanceSchema.safeParse(brut);
  return r.success ? r.data : REGLAGES_RELANCE_DEFAUT;
}

export type Module =
  | { type: "declencheur"; code: string }
  | { type: "attente"; reglage: string }
  | { type: "condition"; code: string }
  | { type: "action"; code: string }
  | { type: "boucle"; vers: number; reglage: string };

/** Déroulé de la relance (identique à la ligne de départ de la migration). */
export const MODULES_RELANCE: Module[] = [
  { type: "declencheur", code: "invitation_en_attente" },
  { type: "attente", reglage: "attente_jours" },
  { type: "condition", code: "toujours_en_attente" },
  { type: "action", code: "retirer_invitation" },
  { type: "attente", reglage: "reinvitation_jours" },
  { type: "action", code: "inviter" },
  { type: "boucle", vers: 1, reglage: "cycles" },
];
