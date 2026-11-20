import { describe, expect, it } from "vitest";
import { conditionsDepuisRequete, requeteDepuisConditions, type GroupeFiltre, type RegleFiltre } from "./requete-prospects";
import type { Condition } from "./prospects";

const regle = (path: string[], operator: string, value: unknown, negated?: boolean): RegleFiltre => ({
  id: path.join("."),
  type: "rule",
  path,
  operator,
  value,
  ...(negated ? { negated } : {}),
});
const requete = (...rules: (RegleFiltre | GroupeFiltre)[]): GroupeFiltre => ({ id: "racine", type: "group", combinator: "and", rules });

describe("panneau « Filtres » ↔ conditions du serveur", () => {
  it("convertit les choix (y compris la négation) et les périodes", () => {
    expect(
      conditionsDepuisRequete(
        requete(
          regle(["statut"], "is_any_of", ["en_relation"]),
          regle(["etape"], "is_none_of", ["perdu", "gagne"]),
          regle(["liste"], "is_any_of", ["Salon"], true),
          regle(["date", "relance"], "periode", { au: "2026-11-20" }),
          regle(["date", "message"], "periode", { du: "2026-11-01", au: "2026-11-15" }),
        ),
      ),
    ).toEqual([
      { champ: "statut", op: "est", valeurs: ["en_relation"] },
      { champ: "etape", op: "nest_pas", valeurs: ["perdu", "gagne"] },
      { champ: "liste", op: "nest_pas", valeurs: ["Salon"] },
      { champ: "relance", au: "2026-11-20" },
      { champ: "message", du: "2026-11-01", au: "2026-11-15" },
    ]);
  });

  it("ignore ce qui n'est pas fini ou pas valide", () => {
    expect(
      conditionsDepuisRequete(
        requete(
          regle(["statut"], "", undefined),
          regle(["etape"], "is_any_of", []),
          regle(["statut"], "is_any_of", ["pirate"]),
          regle(["date", "relance"], "periode", {}),
          regle(["date", "salaire"], "periode", { du: "2026-11-01" }),
          regle(["date", "relation"], "periode", { du: "2026-12-01", au: "2026-11-01" }),
          regle(["nom"], "contains", "x"),
        ),
      ),
    ).toEqual([]);
  });

  it("aller-retour depuis des conditions (lien direct)", () => {
    const conditions: Condition[] = [
      { champ: "statut", op: "est", valeurs: ["en_attente"] },
      { champ: "relance", au: "2026-11-20" },
    ];
    expect(conditionsDepuisRequete(requeteDepuisConditions(conditions))).toEqual(conditions);
    expect(requeteDepuisConditions().rules).toEqual([]);
  });

  it("20 conditions au plus", () => {
    const beaucoup = Array.from({ length: 25 }, () => regle(["date", "relance"], "periode", { du: "2026-11-01" }));
    expect(conditionsDepuisRequete(requete(...beaucoup))).toHaveLength(20);
  });
});
