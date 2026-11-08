import { describe, expect, it } from "vitest";
import { correspond, termesRecherche } from "./recherche";

const camille = { prenom: "Camille", nom: "Durand", entreprise: "Société Générale", poste: "Directrice des opérations" };

describe("termesRecherche", () => {
  it("découpe en mots, sans casse ni accents, en ignorant les espaces en trop", () => {
    expect(termesRecherche("  Écoles  DURAND ")).toEqual(["ecoles", "durand"]);
    expect(termesRecherche("")).toEqual([]);
    expect(termesRecherche("   ")).toEqual([]);
  });
  it("borne le nombre de mots", () => {
    expect(termesRecherche(Array.from({ length: 20 }, (_, i) => `m${i}`).join(" "))).toHaveLength(8);
  });
});

describe("correspond", () => {
  it("trouve dès le premier caractère saisi, n'importe où dans le texte", () => {
    expect(correspond(camille, "c")).toBe(true);
    expect(correspond(camille, "dur")).toBe(true);
  });
  it("ignore la casse et les accents, dans les deux sens", () => {
    expect(correspond(camille, "societe")).toBe(true);
    expect(correspond(camille, "OPÉRATIONS")).toBe(true);
    expect(correspond({ ...camille, nom: "Hélène" }, "helene")).toBe(true);
  });
  it("exige tous les mots, dans n'importe quel ordre et sur n'importe quel champ", () => {
    expect(correspond(camille, "durand camille")).toBe(true);
    expect(correspond(camille, "camille generale")).toBe(true);
    expect(correspond(camille, "camille martin")).toBe(false);
  });
  it("une saisie vide garde tout ; les champs vides ne gênent pas", () => {
    expect(correspond(camille, "")).toBe(true);
    expect(correspond({ prenom: null, nom: null, entreprise: null, poste: null }, "x")).toBe(false);
  });
});
