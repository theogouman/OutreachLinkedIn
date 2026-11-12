import { describe, expect, it } from "vitest";
import { profilAffichable } from "./profil-linkedin";

const brut = {
  source: "apify",
  lu_le: "2026-11-12T16:18:00Z",
  titre: "Co-founder, The Grizzly Labs",
  localisation: "Paris, Île-de-France, France",
  a_propos: "Mobile et systèmes à grande échelle.",
  email: "bruno@example.com",
  relations: 273,
  abonnes: 354,
  entreprise: {
    nom: "The Grizzly Labs",
    secteur: "Software Development",
    taille: "11",
    siege: "Paris, FR",
    site: "https://thegrizzlylabs.com",
    linkedin: "https://www.linkedin.com/company/1801695/",
    creation: 2010,
    type: "Privately Held",
    description: "Genius Scan.",
  },
  experiences: [
    { poste: "Co-founder", entreprise: "The Grizzly Labs", periode: "Jun 2010 - Present · 16 yrs", lieu: "Paris", description: "Apps", actuel: true },
    { poste: "Ingénieur", entreprise: "Acme", periode: "2008 - 2010", actuel: false },
  ],
  formation: [{ ecole: "UIUC", diplome: "MS", domaine: "Computer Science", periode: "2008 - 2010" }],
  avant: { poste: "CEO", entreprise: "Grizzly" },
};

describe("profil LinkedIn affichable (donnée tierce revalidée à la lecture)", () => {
  it("garde les champs attendus", () => {
    const p = profilAffichable(brut)!;
    expect(p.titre).toBe("Co-founder, The Grizzly Labs");
    expect(p.email).toBe("bruno@example.com");
    expect(p.entreprise).toMatchObject({ nom: "The Grizzly Labs", site: "https://thegrizzlylabs.com/", creation: 2010 });
    expect(p.experiences.map((e) => e.poste)).toEqual(["Co-founder", "Ingénieur"]);
    expect(p.formation[0]).toMatchObject({ ecole: "UIUC", diplome: "MS" });
    expect(p.avant).toEqual({ poste: "CEO", entreprise: "Grizzly" });
    expect(p.luLe).toEqual(new Date("2026-11-12T16:18:00Z"));
  });

  it("écarte les liens qui ne sont pas en https et un e-mail mal formé", () => {
    const p = profilAffichable({
      ...brut,
      email: "pas un email <script>",
      entreprise: { ...brut.entreprise, site: "javascript:alert(1)", linkedin: "http://linkedin.com/company/x" },
    })!;
    expect(p.email).toBeNull();
    expect(p.entreprise?.site).toBeNull();
    expect(p.entreprise?.linkedin).toBeNull();
  });

  it("borne les textes et ignore les éléments mal formés", () => {
    const p = profilAffichable({
      ...brut,
      a_propos: "x".repeat(20_000),
      experiences: [{ poste: 42 }, "texte", null, { poste: "Ok", entreprise: "B" }],
      formation: "pas une liste",
    })!;
    expect(p.aPropos!.length).toBeLessThanOrEqual(5000);
    expect(p.experiences.map((e) => e.poste)).toEqual(["Ok"]);
    expect(p.formation).toEqual([]);
  });

  it("rien d'exploitable → null", () => {
    expect(profilAffichable(null)).toBeNull();
    expect(profilAffichable("x")).toBeNull();
  });
});
