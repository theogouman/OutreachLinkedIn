import { describe, expect, it } from "vitest";
import { bornerSaisie, cheminCrayonCoche, saisieEnCours } from "./saisie-valeurs-regles";

describe("saisie de valeurs : règles", () => {
  it("borne une valeur saisie au minimum et au maximum ; vide ou invalide → minimum", () => {
    expect(bornerSaisie("25", 21, 90)).toBe(25);
    expect(bornerSaisie("5", 21, 90)).toBe(21);
    expect(bornerSaisie("200", 21, 90)).toBe(90);
    expect(bornerSaisie("", 1, 20)).toBe(1);
    expect(bornerSaisie("abc", 0, 20)).toBe(0);
    expect(bornerSaisie("7.9", 0, 20)).toBe(7);
  });

  it("pendant la frappe : chiffres seulement, au-dessus du maximum ramené au maximum (signalé)", () => {
    expect(saisieEnCours("2", 90)).toEqual({ texte: "2", depasse: false });
    expect(saisieEnCours("95", 90)).toEqual({ texte: "90", depasse: true });
    expect(saisieEnCours("-3e", 90)).toEqual({ texte: "3", depasse: false });
    expect(saisieEnCours("", 90)).toEqual({ texte: "", depasse: false });
  });

  it("morphing crayon → coche : même nombre de points de bout en bout, tracé fermé, progression bornée", () => {
    const debut = cheminCrayonCoche(0);
    const milieu = cheminCrayonCoche(0.5);
    const fin = cheminCrayonCoche(1);
    for (const c of [debut, milieu, fin]) {
      expect(c.startsWith("M")).toBe(true);
      expect(c.endsWith("Z")).toBe(true);
      expect(c.split("L")).toHaveLength(94);
    }
    expect(cheminCrayonCoche(-1)).toBe(debut);
    expect(cheminCrayonCoche(2)).toBe(fin);
    expect(milieu).not.toBe(debut);
  });
});
