import { describe, expect, it } from "vitest";
import { dansPlage, debutJour, debutMois, debutSemaine, prochainDebutPlage, type Plages } from "./temps";

const TZ = "Europe/Paris";
const PLAGES: Plages = {
  jours: [1, 2, 3, 4, 5],
  creneaux: [
    { debut: "09:00", fin: "12:30" },
    { debut: "14:00", fin: "18:30" },
  ],
};

describe("débuts de période (Europe/Paris)", () => {
  it("début du jour en hiver (UTC+1) et en été (UTC+2)", () => {
    expect(debutJour(new Date("2026-01-15T10:00:00Z"), TZ).toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(debutJour(new Date("2026-07-15T10:00:00Z"), TZ).toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("à 23h30 UTC, on est déjà le lendemain à Paris", () => {
    expect(debutJour(new Date("2026-01-15T23:30:00Z"), TZ).toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("la semaine commence le lundi 00:00 local", () => {
    // jeudi 2026-11-05 → lundi 2026-11-02
    expect(debutSemaine(new Date("2026-11-05T12:00:00Z"), TZ).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    // dimanche reste dans la semaine du lundi précédent
    expect(debutSemaine(new Date("2026-11-08T20:00:00Z"), TZ).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(debutSemaine(new Date("2026-11-05T12:00:00Z"), TZ, 1).toISOString()).toBe("2026-11-08T23:00:00.000Z");
  });

  it("début de mois, y compris passage d'année", () => {
    expect(debutMois(new Date("2026-12-20T12:00:00Z"), TZ, 1).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("le jour du passage à l'heure d'été dure 23 h", () => {
    const debut = debutJour(new Date("2026-03-29T12:00:00Z"), TZ);
    const lendemain = debutJour(new Date("2026-03-29T12:00:00Z"), TZ, 1);
    expect((lendemain.getTime() - debut.getTime()) / 3_600_000).toBe(23);
  });
});

describe("plages horaires", () => {
  it("dans / hors plage en heure locale", () => {
    expect(dansPlage(new Date("2026-11-05T08:00:00Z"), PLAGES, TZ)).toBe(true); // jeudi 9h00
    expect(dansPlage(new Date("2026-11-05T07:59:00Z"), PLAGES, TZ)).toBe(false); // 8h59
    expect(dansPlage(new Date("2026-11-05T11:30:00Z"), PLAGES, TZ)).toBe(false); // 12h30 exclu
    expect(dansPlage(new Date("2026-11-07T10:00:00Z"), PLAGES, TZ)).toBe(false); // samedi
  });

  it("prochain début de plage : pause de midi, soir, week-end", () => {
    expect(prochainDebutPlage(new Date("2026-11-05T12:00:00Z"), PLAGES, TZ)?.toISOString()).toBe(
      "2026-11-05T13:00:00.000Z",
    ); // jeudi 13h → 14h
    expect(prochainDebutPlage(new Date("2026-11-06T18:00:00Z"), PLAGES, TZ)?.toISOString()).toBe(
      "2026-11-09T08:00:00.000Z",
    ); // vendredi 19h → lundi 9h
  });

  it("renvoie l'instant lui-même s'il est déjà dans une plage", () => {
    const t = new Date("2026-11-05T09:15:00Z");
    expect(prochainDebutPlage(t, PLAGES, TZ)).toBe(t);
  });

  it("renvoie null si aucune plage n'est définie", () => {
    expect(prochainDebutPlage(new Date(), { jours: [], creneaux: [] }, TZ)).toBeNull();
  });
});
