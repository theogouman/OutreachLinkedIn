import { describe, expect, it } from "vitest";
import { appliquerLocalement, filtresActifs } from "./definition";
import { FILTRES_PROSPECTS, filtresProspectsDepuisUrl, filtresProspectsSchema, type Condition, type ProspectFiltrable } from "./prospects";

const p = (x: Partial<ProspectFiltrable>): ProspectFiltrable => ({
  prenom: "Camille", nom: "Durand", poste: "CEO", entreprise: "Studio Nord", listeOrigine: "Salon",
  statutRelation: "en_relation", etape: "premier_message", prochaineRelance: null, relationLe: "2026-10-02", dernierMessageLe: "2026-11-18", ...x,
});
const lignes = [
  p({ prenom: "Camille" }),
  p({ prenom: "Hugo", nom: "Martin", statutRelation: "en_attente", etape: "invitation_envoyee", prochaineRelance: "2026-11-10", relationLe: null, dernierMessageLe: null }),
  p({ prenom: "Léa", nom: "Bernard", listeOrigine: null, prochaineRelance: "2026-11-20", relationLe: "2026-11-15", dernierMessageLe: "2026-11-01" }),
];
const noms = (r: ProspectFiltrable[]) => r.map((x) => x.prenom);
const avec = (...conditions: Condition[]) => noms(appliquerLocalement(lignes, { page: 1, conditions }, FILTRES_PROSPECTS));

describe("filtres des prospects (règles locales)", () => {
  it("sans filtre, tout passe ; une valeur vide ne filtre pas", () => {
    expect(noms(appliquerLocalement(lignes, { page: 1 }, FILTRES_PROSPECTS))).toEqual(["Camille", "Hugo", "Léa"]);
    expect(noms(appliquerLocalement(lignes, { page: 1, conditions: [], recherche: "  " }, FILTRES_PROSPECTS))).toHaveLength(3);
  });
  it("relation, étape, liste : est l'un de / n'est aucun de (une liste vide passe « n'est aucun de »)", () => {
    expect(avec({ champ: "statut", op: "est", valeurs: ["en_attente"] })).toEqual(["Hugo"]);
    expect(avec({ champ: "statut", op: "nest_pas", valeurs: ["en_attente"] })).toEqual(["Camille", "Léa"]);
    expect(avec({ champ: "etape", op: "est", valeurs: ["premier_message", "invitation_envoyee"] })).toEqual(["Camille", "Hugo", "Léa"]);
    expect(avec({ champ: "liste", op: "est", valeurs: ["Salon"] })).toEqual(["Camille", "Hugo"]);
    expect(avec({ champ: "liste", op: "nest_pas", valeurs: ["Salon"] })).toEqual(["Léa"]);
  });
  it("dates (relance, relation, dernier message) : bornes incluses, une date vide ne passe jamais", () => {
    expect(avec({ champ: "relance", au: "2026-11-10" })).toEqual(["Hugo"]);
    expect(avec({ champ: "relance", du: "2026-11-10", au: "2026-11-20" })).toEqual(["Hugo", "Léa"]);
    expect(avec({ champ: "relation", du: "2026-11-01" })).toEqual(["Léa"]);
    expect(avec({ champ: "message", du: "2026-11-18", au: "2026-11-18" })).toEqual(["Camille"]);
  });
  it("les conditions se cumulent (ET) avec la recherche", () => {
    expect(avec({ champ: "etape", op: "est", valeurs: ["premier_message"] }, { champ: "relation", au: "2026-10-31" })).toEqual(["Camille"]);
    expect(
      noms(appliquerLocalement(lignes, { page: 1, recherche: "lea", conditions: [{ champ: "etape", op: "est", valeurs: ["premier_message"] }] }, FILTRES_PROSPECTS)),
    ).toEqual(["Léa"]);
  });
  it("filtres actifs et validation des valeurs reçues", () => {
    expect(filtresActifs({ page: 1, conditions: [], recherche: " " }, ["conditions", "recherche"])).toEqual([]);
    const ok = (conditions: unknown) => filtresProspectsSchema.safeParse({ conditions }).success;
    expect(ok([{ champ: "statut", op: "est", valeurs: ["en_relation"] }])).toBe(true);
    expect(ok([{ champ: "statut", op: "est", valeurs: ["inconnu"] }])).toBe(false);
    expect(ok([{ champ: "etape", op: "ou", valeurs: ["x"] }])).toBe(false);
    expect(ok([{ champ: "etape", op: "est", valeurs: [] }])).toBe(false);
    expect(ok([{ champ: "relance" }])).toBe(false);
    expect(ok([{ champ: "relance", du: "pas-une-date" }])).toBe(false);
    expect(ok([{ champ: "relance", du: "2026-12-01", au: "2026-11-01" }])).toBe(false);
    expect(ok([{ champ: "salaire", du: "2026-12-01" }])).toBe(false);
    expect(ok(Array.from({ length: 21 }, () => ({ champ: "relance", du: "2026-12-01" })))).toBe(false);
    expect(filtresProspectsSchema.parse({}).page).toBe(1);
  });
});

describe("lien direct vers la liste filtrée (cartes de la page Statistiques)", () => {
  it("lit le statut de relation et les relances dues ; ignore le reste", () => {
    expect(filtresProspectsDepuisUrl({ statut: "en_relation" }, "2026-11-20")).toEqual({
      page: 1,
      conditions: [{ champ: "statut", op: "est", valeurs: ["en_relation"] }],
    });
    expect(filtresProspectsDepuisUrl({ relance: "dues" }, "2026-11-20")).toEqual({ page: 1, conditions: [{ champ: "relance", au: "2026-11-20" }] });
    expect(filtresProspectsDepuisUrl({ statut: "'; drop table", relance: "hier" }, "2026-11-20")).toEqual({ page: 1 });
    expect(filtresProspectsDepuisUrl({}, "2026-11-20")).toEqual({ page: 1 });
  });
});
