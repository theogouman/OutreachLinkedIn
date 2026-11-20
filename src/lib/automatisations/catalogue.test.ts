import { describe, expect, it } from "vitest";
import { MODULES_RELANCE, REGLAGES_RELANCE_DEFAUT, reglagesAffichables, reglagesRelanceSchema } from "./catalogue";

describe("catalogue des automatisations : relance des invitations", () => {
  it("réglages par défaut : attente 21 à 28 jours, réinvitation 21 à 25 jours, 2 cycles, 10 par jour", () => {
    expect(REGLAGES_RELANCE_DEFAUT).toEqual({
      attente_jours: { min: 21, max: 28 },
      reinvitation_jours: { min: 21, max: 25 },
      cycles: 2,
      plafond_jour: 10,
    });
    expect(reglagesRelanceSchema.parse(REGLAGES_RELANCE_DEFAUT)).toEqual(REGLAGES_RELANCE_DEFAUT);
  });

  it("cycles : un nombre de 1 à 10, ou sans limite (null)", () => {
    const avec = (cycles: unknown) => reglagesRelanceSchema.safeParse({ ...REGLAGES_RELANCE_DEFAUT, cycles }).success;
    expect([1, 3, 10, null].map(avec)).toEqual([true, true, true, true]);
    expect([0, 11, 2.5, "2", undefined].map(avec)).toEqual([false, false, false, false, false]);
  });

  it("refuse une réinvitation avant 21 jours, une plage inversée, un plafond hors bornes", () => {
    const refuse = (patch: object) => !reglagesRelanceSchema.safeParse({ ...REGLAGES_RELANCE_DEFAUT, ...patch }).success;
    expect(refuse({ reinvitation_jours: { min: 14, max: 25 } })).toBe(true);
    expect(refuse({ attente_jours: { min: 30, max: 21 } })).toBe(true);
    expect(refuse({ attente_jours: { min: 3, max: 10 } })).toBe(true);
    expect(refuse({ attente_jours: { min: 21, max: 200 } })).toBe(true);
    expect(refuse({ plafond_jour: 0 })).toBe(true);
    expect(refuse({ plafond_jour: 21 })).toBe(true);
    // Clé inconnue : refusée (aucun réglage caché).
    expect(refuse({ pirate: true })).toBe(true);
  });

  it("réglages lus en base revalidés : invalides → valeurs par défaut, jamais d'erreur à l'affichage", () => {
    expect(reglagesAffichables({ cycles: "beaucoup" })).toEqual(REGLAGES_RELANCE_DEFAUT);
    expect(reglagesAffichables({ ...REGLAGES_RELANCE_DEFAUT, cycles: null })).toEqual({ ...REGLAGES_RELANCE_DEFAUT, cycles: null });
  });

  it("décrite en modules (repris par l'éditeur d'une itération suivante), boucle bornée par le réglage des cycles", () => {
    expect(MODULES_RELANCE.map((m) => m.type)).toEqual(["declencheur", "attente", "condition", "action", "attente", "action", "boucle"]);
    expect(MODULES_RELANCE.at(-1)).toEqual({ type: "boucle", vers: 1, reglage: "cycles" });
  });
});
