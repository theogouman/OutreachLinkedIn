import { conditionSchema, CHAMPS_DATE, type Condition } from "./prospects";

/*
 * Passage entre la requête du panneau « Filtres » (ReUI : arbre de règles { path, operator, value })
 * et les conditions validées que le serveur comprend (src/lib/filtres/prospects.ts). Toutes les
 * règles sont en ET (les groupes sont désactivés dans le panneau) ; une règle incomplète ou
 * invalide est ignorée tant qu'elle n'est pas finie.
 */

/** Opérateurs proposés pour Relation, Étape et Liste (plusieurs valeurs). */
export const OP_EST = "is_any_of";
export const OP_NEST_PAS = "is_none_of";
/** Opérateur des dates : une période (du … au …, une seule borne possible). */
export const OP_PERIODE = "periode";
export const CHAMP_DATES = "date";

export interface Periode {
  du?: string;
  au?: string;
}

/** Forme minimale d'une règle ReUI (FilterRule), sans dépendre du composant. */
export interface RegleFiltre {
  id: string;
  type: "rule";
  path: string[];
  operator: string;
  value: unknown;
  negated?: boolean;
}
export interface GroupeFiltre {
  id: string;
  type: "group";
  combinator: "and" | "or";
  rules: (RegleFiltre | GroupeFiltre)[];
}

function regles(n: RegleFiltre | GroupeFiltre): RegleFiltre[] {
  return n.type === "rule" ? [n] : n.rules.flatMap(regles);
}

/** Conditions validées d'une requête du panneau (20 au plus). */
export function conditionsDepuisRequete(requete: GroupeFiltre): Condition[] {
  const sortie: Condition[] = [];
  for (const r of regles(requete)) {
    let brute: unknown = null;
    const [champ, sous] = r.path;
    if ((champ === "statut" || champ === "etape" || champ === "liste") && (r.operator === OP_EST || r.operator === OP_NEST_PAS)) {
      const est = (r.operator === OP_EST) !== !!r.negated;
      brute = { champ, op: est ? "est" : "nest_pas", valeurs: Array.isArray(r.value) ? r.value : [] };
    } else if (champ === CHAMP_DATES && r.operator === OP_PERIODE && (CHAMPS_DATE as readonly string[]).includes(sous ?? "")) {
      const v = (r.value ?? {}) as Periode;
      brute = { champ: sous, ...(v.du ? { du: v.du } : {}), ...(v.au ? { au: v.au } : {}) };
    }
    const c = conditionSchema.safeParse(brute);
    if (c.success) sortie.push(c.data);
    if (sortie.length === 20) break;
  }
  return sortie;
}

/** Requête du panneau pour des conditions données (ex. lien direct depuis la page Statistiques). */
export function requeteDepuisConditions(conditions: Condition[] = []): GroupeFiltre {
  return {
    id: "racine",
    type: "group",
    combinator: "and",
    rules: conditions.map((c, i) =>
      c.champ === "statut" || c.champ === "etape" || c.champ === "liste"
        ? { id: `r${i}`, type: "rule", path: [c.champ], operator: c.op === "est" ? OP_EST : OP_NEST_PAS, value: [...c.valeurs] }
        : { id: `r${i}`, type: "rule", path: [CHAMP_DATES, c.champ], operator: OP_PERIODE, value: { du: c.du, au: c.au } },
    ),
  };
}
