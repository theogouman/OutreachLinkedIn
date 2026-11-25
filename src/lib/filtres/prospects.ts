import { z } from "zod";
import { correspond, normaliser } from "@/lib/recherche";
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

/*
 * Tri de la liste (bouton « Trier ») : un champ d'une liste fermée et un sens. Absent : par nom.
 * Valeurs vides toujours en dernier, puis départage par nom, prénom et identifiant (ordre stable,
 * pagination sans doublon). Textes comparés sans casse ni accents (`normaliser`, « Émilie » avant
 * « Zoé »), octet par octet. Même règle en local (`trierLocalement`) et en SQL (`prospectsDepuis`).
 */
export const CHAMPS_TRI = ["nom", "entreprise", "etape", "relance", "relation", "message", "ajout"] as const;
export type ChampTri = (typeof CHAMPS_TRI)[number];
export const triSchema = z.object({ champ: z.enum(CHAMPS_TRI), sens: z.enum(["asc", "desc"]) }).strict();
export type Tri = z.infer<typeof triSchema>;
export const TRI_DEFAUT: Tri = { champ: "nom", sens: "asc" };

export const filtresProspectsSchema = z.object({
  conditions: z.array(conditionSchema).max(20).optional(),
  tri: triSchema.optional(),
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

/** Ce que le tri local lit d'une ligne (en plus des champs filtrables). */
export interface ProspectTriable extends ProspectFiltrable {
  id: string;
  /** Ajout dans l'outil, horodatage UTC « AAAA-MM-JJTHH:MM:SS.ffffff » (comparable comme texte). */
  ajouteLe: string;
}

const comparerTexte = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function valeurTri(p: ProspectTriable, champ: ChampTri, ordreEtapes: Record<string, number>): string | number | null {
  switch (champ) {
    case "nom":
      return normaliser(p.nom ?? "");
    case "entreprise":
      return p.entreprise === null ? null : normaliser(p.entreprise);
    case "etape":
      return ordreEtapes[p.etape] ?? null;
    case "relance":
      return p.prochaineRelance;
    case "relation":
      return p.relationLe;
    case "message":
      return p.dernierMessageLe;
    case "ajout":
      return p.ajouteLe;
  }
}

/** Tri instantané des lignes déjà affichées (la réponse du serveur, exacte, la remplace ensuite). */
export function trierLocalement<L extends ProspectTriable>(lignes: L[], tri: Tri | undefined, ordreEtapes: Record<string, number>): L[] {
  const t = tri ?? TRI_DEFAUT;
  const signe = t.sens === "asc" ? 1 : -1;
  return [...lignes].sort((a, b) => {
    const va = valeurTri(a, t.champ, ordreEtapes);
    const vb = valeurTri(b, t.champ, ordreEtapes);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : comparerTexte(String(va), String(vb));
      if (c !== 0) return c * signe;
    }
    if (t.champ === "nom") {
      const c = comparerTexte(normaliser(a.prenom ?? ""), normaliser(b.prenom ?? ""));
      if (c !== 0) return c * signe;
    } else {
      const c = comparerTexte(normaliser(a.nom ?? ""), normaliser(b.nom ?? "")) || comparerTexte(normaliser(a.prenom ?? ""), normaliser(b.prenom ?? ""));
      if (c !== 0) return c;
    }
    return comparerTexte(a.id, b.id);
  });
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
