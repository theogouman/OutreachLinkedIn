import { z } from "zod";
import { correspond } from "@/lib/recherche";
import type { DefinitionFiltre } from "./definition";

/*
 * Filtres de la liste des prospects (validés côté serveur, partagés avec le navigateur) :
 * une recherche et des conditions, toutes en ET (panneau « Filtres », ReUI) :
 *   - Relation, Étape, Liste : « est l'un de » / « n'est aucun de » une ou plusieurs valeurs ;
 *   - dates (relance prévue, entrée en relation, dernier message) : du … au …, bornes incluses,
 *     jours de Paris au format AAAA-MM-JJ ; une seule borne = avant le / à partir du.
 * Même règle en local (`correspondCondition`) et en SQL (`prospectsDepuis`), vérifiée par
 * tests/db/filtres.test.ts.
 */

export const STATUTS_RELATION = ["en_relation", "en_attente", "invitation_recue", "a_inviter"] as const;
export const CHAMPS_DATE = ["relance", "relation", "message"] as const;
export type ChampDate = (typeof CHAMPS_DATE)[number];

const operateurChoix = z.enum(["est", "nest_pas"]);
const valeurs = z.array(z.string().min(1).max(100)).min(1).max(30);
const jour = z.iso.date();
const conditionDate = (champ: ChampDate) =>
  z
    .object({ champ: z.literal(champ), du: jour.optional(), au: jour.optional() })
    .refine((c) => c.du || c.au, "Choisis au moins une date.")
    .refine((c) => !c.du || !c.au || c.du <= c.au, "La première date doit précéder la seconde.");

export const conditionSchema = z.union([
  z.object({ champ: z.literal("statut"), op: operateurChoix, valeurs: z.array(z.enum(STATUTS_RELATION)).min(1).max(4) }),
  z.object({ champ: z.literal("etape"), op: operateurChoix, valeurs }),
  z.object({ champ: z.literal("liste"), op: operateurChoix, valeurs }),
  conditionDate("relance"),
  conditionDate("relation"),
  conditionDate("message"),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const filtresProspectsSchema = z.object({
  conditions: z.array(conditionSchema).max(20).optional(),
  recherche: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type FiltresProspects = z.infer<typeof filtresProspectsSchema>;

/** Ce que les règles locales lisent d'une ligne (dates : jour de Paris, AAAA-MM-JJ). */
export interface ProspectFiltrable {
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  entreprise: string | null;
  listeOrigine: string | null;
  statutRelation: string;
  etape: string;
  prochaineRelance: string | null;
  relationLe: string | null;
  dernierMessageLe: string | null;
}

function dateDe(p: ProspectFiltrable, champ: ChampDate) {
  return champ === "relance" ? p.prochaineRelance : champ === "relation" ? p.relationLe : p.dernierMessageLe;
}

/** Une condition, comme en SQL : « n'est aucun de » garde les valeurs vides ; une date vide ne passe jamais. */
export function correspondCondition(p: ProspectFiltrable, c: Condition): boolean {
  if (c.champ === "statut" || c.champ === "etape" || c.champ === "liste") {
    const v = c.champ === "statut" ? p.statutRelation : c.champ === "etape" ? p.etape : p.listeOrigine;
    const dedans = v !== null && (c.valeurs as string[]).includes(v);
    return c.op === "est" ? dedans : !dedans;
  }
  const d = dateDe(p, c.champ);
  return d !== null && (!c.du || d >= c.du) && (!c.au || d <= c.au);
}

type Def = DefinitionFiltre<ProspectFiltrable, FiltresProspects>;

export const FILTRES_PROSPECTS: readonly Def[] = [
  { cle: "recherche", libelle: "Rechercher", type: "texte", correspond: (p, v: string) => correspond(p, v) },
  {
    cle: "conditions",
    libelle: "Filtres",
    type: "choix",
    correspond: (p, v: Condition[]) => v.every((c) => correspondCondition(p, c)),
  },
];

export const FILTRES_PROSPECTS_VIDES: FiltresProspects = { page: 1 };

/**
 * Lien direct vers la liste déjà filtrée (cartes d'indicateurs de la page Statistiques) :
 * `?statut=<statut de relation>`, `?relance=dues` (relance aujourd'hui ou en retard, `aujourdhui`
 * au format AAAA-MM-JJ, heure de Paris). Valeur inconnue : ignorée.
 */
export function filtresProspectsDepuisUrl(p: { statut?: string; relance?: string }, aujourdhui: string): FiltresProspects {
  const statut = z.enum(STATUTS_RELATION).safeParse(p.statut);
  const conditions: Condition[] = [
    ...(statut.success ? [{ champ: "statut" as const, op: "est" as const, valeurs: [statut.data] }] : []),
    ...(p.relance === "dues" ? [{ champ: "relance" as const, au: aujourdhui }] : []),
  ];
  return { page: 1, ...(conditions.length ? { conditions } : {}) };
}
