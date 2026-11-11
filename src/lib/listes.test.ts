import { describe, expect, it } from "vitest";
import { champsDeListe, detailsAffichables, lienSur } from "./listes";

describe("informations propres aux listes", () => {
  it("n'expose que les champs déclarés par la liste du prospect", () => {
    const details = { pageNotion: "https://acme.notion.site/Offres", requete: "kit presse", usageNotion: "Wiki", autre: "x" };
    expect(detailsAffichables("Page Notion Publique", details)).toEqual([
      { cle: "pageNotion", libelle: "Page Notion", type: "lien", valeur: "https://acme.notion.site/Offres" },
      { cle: "requete", libelle: "Requête", type: "texte", valeur: "kit presse" },
      { cle: "usageNotion", libelle: "Usage Notion", type: "texte", valeur: "Wiki" },
    ]);
    // Une autre liste n'affiche rien de ces champs.
    expect(detailsAffichables("LM", details)).toEqual([]);
    expect(detailsAffichables(null, details)).toEqual([]);
  });

  it("ignore les valeurs vides ou d'un mauvais type", () => {
    expect(detailsAffichables("Page Notion Publique", { requete: "  ", usageNotion: 42, pageNotion: null })).toEqual([]);
    expect(detailsAffichables("Page Notion Publique", null)).toEqual([]);
    expect(detailsAffichables("Page Notion Publique", ["x"])).toEqual([]);
  });

  it("refuse tout lien qui n'est pas en https", () => {
    expect(lienSur("javascript:alert(1)")).toBeNull();
    expect(lienSur("data:text/html,<b>x</b>")).toBeNull();
    expect(lienSur("http://acme.notion.site")).toBeNull();
    expect(lienSur("https://user:mdp@acme.notion.site")).toBeNull();
    expect(lienSur("pas une url")).toBeNull();
    expect(lienSur("https://acme.notion.site/x")).toBe("https://acme.notion.site/x");
  });

  it("ne lit pas les propriétés héritées", () => {
    expect(champsDeListe("toString")).toEqual([]);
    expect(champsDeListe("__proto__")).toEqual([]);
  });
});
