import { describe, expect, it } from "vitest";
import { appliquerLocalement, filtresActifs } from "./definition";
import { FILTRES_PROSPECTS, filtresProspectsSchema, type ProspectFiltrable } from "./prospects";

const p = (x: Partial<ProspectFiltrable>): ProspectFiltrable => ({
  prenom: "Camille", nom: "Durand", poste: "CEO", entreprise: "Studio Nord", listeOrigine: "Salon",
  statutRelation: "en_relation", etape: "premier_message", prochaineRelance: null, ...x,
});
const lignes = [
  p({ prenom: "Camille" }),
  p({ prenom: "Hugo", nom: "Martin", statutRelation: "en_attente", etape: "invitation_envoyee", prochaineRelance: "2026-11-10" }),
  p({ prenom: "Léa", nom: "Bernard", listeOrigine: "Webinaire", prochaineRelance: "2026-11-20" }),
];
const noms = (r: ProspectFiltrable[]) => r.map((x) => x.prenom);

describe("filtres des prospects (règles locales)", () => {
  it("sans filtre, tout passe ; une valeur vide ne filtre pas", () => {
    expect(noms(appliquerLocalement(lignes, { page: 1 }, FILTRES_PROSPECTS))).toEqual(["Camille", "Hugo", "Léa"]);
    expect(noms(appliquerLocalement(lignes, { page: 1, etape: "", recherche: "  " }, FILTRES_PROSPECTS))).toHaveLength(3);
  });
  it("chaque filtre de choix compare à l'égalité", () => {
    expect(noms(appliquerLocalement(lignes, { page: 1, statut: "en_attente" }, FILTRES_PROSPECTS))).toEqual(["Hugo"]);
    expect(noms(appliquerLocalement(lignes, { page: 1, etape: "premier_message" }, FILTRES_PROSPECTS))).toEqual(["Camille", "Léa"]);
    expect(noms(appliquerLocalement(lignes, { page: 1, liste: "Webinaire" }, FILTRES_PROSPECTS))).toEqual(["Léa"]);
  });
  it("la date de relance garde les relances planifiées jusqu'à ce jour inclus", () => {
    expect(noms(appliquerLocalement(lignes, { page: 1, relanceAvant: "2026-11-10" }, FILTRES_PROSPECTS))).toEqual(["Hugo"]);
  });
  it("les filtres se cumulent avec la recherche", () => {
    expect(noms(appliquerLocalement(lignes, { page: 1, etape: "premier_message", recherche: "lea" }, FILTRES_PROSPECTS))).toEqual(["Léa"]);
  });
  it("liste des filtres actifs et validation des valeurs reçues", () => {
    expect(filtresActifs({ page: 1, etape: "x", liste: "", recherche: " " }, ["etape", "liste", "recherche"])).toEqual(["etape"]);
    expect(filtresProspectsSchema.safeParse({ statut: "inconnu" }).success).toBe(false);
    expect(filtresProspectsSchema.safeParse({ relanceAvant: "pas-une-date" }).success).toBe(false);
    expect(filtresProspectsSchema.parse({}).page).toBe(1);
  });
});
