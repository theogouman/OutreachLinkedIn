import { describe, expect, it } from "vitest";
import { periodesActives, resumeFile, resumePlafonds, resumeRythme, sectionDepuis } from "./reglages";

describe("sectionDepuis", () => {
  it("accepte les sections connues", () => {
    expect(sectionDepuis("file")).toBe("file");
    expect(sectionDepuis("plafonds")).toBe("plafonds");
    expect(sectionDepuis("rythme")).toBe("rythme");
  });

  it("ignore toute autre valeur", () => {
    expect(sectionDepuis(null)).toBeNull();
    expect(sectionDepuis(undefined)).toBeNull();
    expect(sectionDepuis("")).toBeNull();
    expect(sectionDepuis("FILE")).toBeNull();
    expect(sectionDepuis("constructor")).toBeNull();
    expect(sectionDepuis("<script>")).toBeNull();
    // Section retirée (données de démonstration) : un ancien lien ouvre la page fermée.
    expect(sectionDepuis("demo")).toBeNull();
    expect(sectionDepuis(["file"])).toBeNull();
  });
});

describe("periodesActives", () => {
  it("ne garde que les périodes plafonnées de chaque action", () => {
    expect(periodesActives("invitation")).toEqual(["jour", "semaine"]);
    expect(periodesActives("note_invitation")).toEqual(["mois"]);
    expect(periodesActives("message")).toEqual(["jour"]);
  });
});

describe("resumeFile", () => {
  it("décrit la file vide", () => {
    expect(resumeFile(0, 0)).toBe("Aucune action en attente");
  });
  it("compte les actions et les envois à vérifier", () => {
    expect(resumeFile(1, 0)).toBe("1 action en attente");
    expect(resumeFile(12, 0)).toBe("12 actions en attente");
    expect(resumeFile(3, 1)).toBe("3 actions en attente · 1 à vérifier");
    expect(resumeFile(0, 2)).toBe("2 à vérifier");
  });
});

describe("resumePlafonds", () => {
  it("donne chaque action avec ses plafonds", () => {
    const r = resumePlafonds({
      invitation: { jour: 20, semaine: 100, mois: null },
      note_invitation: { jour: null, semaine: null, mois: 4 },
      lecture_profil: { jour: 150, semaine: null, mois: null },
      message: { jour: 50, semaine: null, mois: null },
      lecture_liste: { jour: 3, semaine: null, mois: null },
      retrait_invitation: { jour: 10, semaine: null, mois: null },
    });
    expect(r).toBe("Invitations 20/jour, 100/semaine · Notes 4/mois · Lectures 150/jour · Messages 50/jour · Synchros 3/jour · Retraits 10/jour");
  });
  it("ignore une période vide", () => {
    const r = resumePlafonds({
      invitation: { jour: 20, semaine: null, mois: null },
      note_invitation: { jour: null, semaine: null, mois: null },
      lecture_profil: { jour: 40, semaine: null, mois: null },
      message: { jour: 50, semaine: null, mois: null },
      lecture_liste: { jour: 3, semaine: null, mois: null },
      retrait_invitation: { jour: 10, semaine: null, mois: null },
    });
    expect(r).toBe("Invitations 20/jour · Lectures 40/jour · Messages 50/jour · Synchros 3/jour · Retraits 10/jour");
  });
});

describe("resumeRythme", () => {
  const creneaux = [
    { debut: "09:00", fin: "12:30" },
    { debut: "14:00", fin: "18:30" },
  ];
  it("regroupe les jours consécutifs", () => {
    expect(resumeRythme({ jours: [1, 2, 3, 4, 5], creneaux })).toBe("Lun–Ven · 09:00–12:30, 14:00–18:30");
    expect(resumeRythme({ jours: [5, 1, 2, 3], creneaux: [creneaux[0]] })).toBe("Lun–Mer, Ven · 09:00–12:30");
    expect(resumeRythme({ jours: [1, 3, 7], creneaux: [creneaux[0]] })).toBe("Lun, Mer, Dim · 09:00–12:30");
  });
  it("signale l'absence de jour actif", () => {
    expect(resumeRythme({ jours: [], creneaux })).toBe("Aucun jour actif");
  });
});
