import { describe, expect, it } from "vitest";
import { lireColonnes, lireProspectsCsv, neutraliserFormule } from "./prospects-csv";

const EXPORT = `﻿Name,LinkedIn,Entreprise,Poste,Tags
Jane Doe,https://www.linkedin.com/in/jane-doe,Acme,CEO,chaud
"=HYPERLINK(""https://evil.com"",""clic"")",https://www.linkedin.com/in/evil-one,"@SUM(A1)",-2+3,
Sans URL,,Acme,CTO,
Bob Martin,linkedin.com/in/bob-martin/,Beta,"Head of Sales, EMEA",
Jane Doe,https://fr.linkedin.com/in/JANE-DOE/,Acme,CEO,doublon
`;

const MAPPING = { url: "LinkedIn", nomComplet: "Name", poste: "Poste", entreprise: "Entreprise" };

describe("import des prospects (export Notion)", () => {
  it("liste les colonnes", () => {
    expect(lireColonnes(EXPORT)).toEqual(["Name", "LinkedIn", "Entreprise", "Poste", "Tags"]);
  });

  it("normalise, dédoublonne et rejette les lignes sans URL valide", () => {
    const r = lireProspectsCsv(EXPORT, MAPPING);
    expect(r.prospects.map((p) => p.urlNormalisee)).toEqual([
      "linkedin.com/in/jane-doe",
      "linkedin.com/in/evil-one",
      "linkedin.com/in/bob-martin",
    ]);
    expect(r.lignesRejetees).toBe(1);
    expect(r.prospects[0]).toMatchObject({ prenom: "Jane", nom: "Doe", poste: "CEO", entreprise: "Acme", publicIdentifier: "jane-doe" });
  });

  it("neutralise les formules de tableur", () => {
    const evil = lireProspectsCsv(EXPORT, MAPPING).prospects[1]!;
    expect(evil.prenom?.startsWith("=")).toBe(false);
    expect(evil.entreprise).toBe("SUM(A1)");
    expect(evil.poste).toBe("2+3");
  });

  it("refuse une colonne inexistante", () => {
    expect(() => lireProspectsCsv(EXPORT, { url: "URL inconnue" })).toThrow(/absente/);
  });

  it.each([
    ["=1+1", "1+1"],
    ["+33 6", "33 6"],
    ["@cmd", "cmd"],
    ["Normal", "Normal"],
  ])("neutraliserFormule(%s) = %s", (entree, sortie) => {
    expect(neutraliserFormule(entree)).toBe(sortie);
  });
});
