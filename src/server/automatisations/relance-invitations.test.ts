import { describe, expect, it } from "vitest";
import { decider, type Faits, type Suivi } from "./relance-invitations";
import { REGLAGES_RELANCE_DEFAUT, type ReglagesRelance } from "@/lib/automatisations/catalogue";

const JOUR = 86_400_000;
const T0 = new Date("2026-11-20T10:00:00Z");
const jours = (n: number) => new Date(T0.getTime() + n * JOUR);
const R: ReglagesRelance = REGLAGES_RELANCE_DEFAUT; // attente 21–28, réinvitation 21–25, 2 cycles
const bas = () => 0; // tirage au minimum
const haut = () => 0.999999; // tirage au maximum

function faits(over: Partial<Faits> = {}): Faits {
  return {
    statutRelation: "en_attente",
    etapeTerminale: false,
    invitationEnvoyeeLe: jours(-40),
    invitationIdConnu: true,
    dernierRetraitLe: null,
    tacheEnFile: null,
    ...over,
  };
}
function suivi(over: Partial<Suivi> = {}): Suivi {
  return { etat: "attente_retrait", cycle: 0, prochaineDecisionLe: jours(-19), invitationEnvoyeeLe: jours(-40), retireeLe: null, motif: null, ...over };
}

describe("relance des invitations : début du suivi", () => {
  it("une invitation en attente ouvre un suivi ; échéance = envoi + délai tiré dans la plage d'attente", () => {
    const f = faits({ invitationEnvoyeeLe: jours(-5) });
    expect(decider(null, f, R, T0, bas)).toEqual({
      mettreEnFile: null,
      suivi: { etat: "attente_retrait", cycle: 0, prochaineDecisionLe: jours(16), invitationEnvoyeeLe: jours(-5), retireeLe: null, motif: null },
    });
    expect(decider(null, f, R, T0, haut).suivi?.prochaineDecisionLe?.getTime()).toBeCloseTo(jours(23).getTime(), -4);
  });

  it("invitation déjà ancienne : le suivi s'ouvre et le retrait est décidé dans le même passage", () => {
    const d = decider(null, faits({ invitationEnvoyeeLe: jours(-40) }), R, T0, bas);
    expect(d).toEqual({
      mettreEnFile: "retrait",
      suivi: { etat: "retrait_en_file", cycle: 0, prochaineDecisionLe: jours(-19), invitationEnvoyeeLe: jours(-40), retireeLe: null, motif: null },
    });
  });

  it("pas d'invitation en attente (ou date inconnue) : aucun suivi", () => {
    expect(decider(null, faits({ statutRelation: "a_inviter" }), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: null });
    expect(decider(null, faits({ invitationEnvoyeeLe: null }), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: null });
    expect(decider(null, faits({ statutRelation: "en_relation" }), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: null });
  });
});

describe("attente du retrait", () => {
  it("échéance passée, identifiant connu : retrait mis en file", () => {
    const d = decider(suivi(), faits(), R, T0, bas);
    expect(d.mettreEnFile).toBe("retrait");
    expect(d.suivi).toMatchObject({ etat: "retrait_en_file", cycle: 0, motif: null });
  });

  it("échéance pas encore venue : rien", () => {
    const s = suivi({ prochaineDecisionLe: jours(2) });
    expect(decider(s, faits(), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: s });
  });

  it("identifiant d'invitation inconnu : attend, motif visible, rien en file", () => {
    const d = decider(suivi(), faits({ invitationIdConnu: false }), R, T0, bas);
    expect(d).toEqual({ mettreEnFile: null, suivi: { ...suivi(), motif: "identifiant_invitation_inconnu" } });
  });

  it("invitation disparue d'elle-même (retirée à la main, expirée) : passe au délai de réinvitation, depuis le constat", () => {
    const d = decider(suivi(), faits({ statutRelation: "a_inviter", invitationEnvoyeeLe: null }), R, T0, bas);
    expect(d).toEqual({
      mettreEnFile: null,
      suivi: { ...suivi(), etat: "attente_reinvitation", retireeLe: T0, prochaineDecisionLe: jours(21) },
    });
  });

  it("nouvelle invitation envoyée entre-temps (à la main) : nouvelle date d'envoi, nouvelle échéance", () => {
    const d = decider(suivi(), faits({ invitationEnvoyeeLe: jours(-2) }), R, T0, bas);
    expect(d.suivi).toMatchObject({ etat: "attente_retrait", invitationEnvoyeeLe: jours(-2), prochaineDecisionLe: jours(19) });
    expect(d.mettreEnFile).toBeNull();
  });
});

describe("retrait en file", () => {
  it("tâche encore en file : on attend", () => {
    const s = suivi({ etat: "retrait_en_file" });
    expect(decider(s, faits({ tacheEnFile: "retrait" }), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: s });
  });

  it("retrait fait : délai de réinvitation depuis le retrait (21 jours au moins)", () => {
    const s = suivi({ etat: "retrait_en_file" });
    const d = decider(s, faits({ statutRelation: "a_inviter", invitationEnvoyeeLe: null, dernierRetraitLe: jours(-1) }), R, T0, bas);
    expect(d.suivi).toMatchObject({ etat: "attente_reinvitation", retireeLe: jours(-1), prochaineDecisionLe: jours(20) });
  });

  it("tâche annulée ou échouée, invitation toujours en attente : retour à l'attente, nouvelle échéance tirée", () => {
    const s = suivi({ etat: "retrait_en_file" });
    const d = decider(s, faits(), R, T0, bas);
    expect(d).toEqual({ mettreEnFile: null, suivi: { ...s, etat: "attente_retrait", prochaineDecisionLe: jours(21) } });
  });
});

describe("attente de la réinvitation", () => {
  const s = suivi({ etat: "attente_reinvitation", retireeLe: jours(-22), prochaineDecisionLe: jours(-1) });

  it("échéance passée et 21 jours écoulés depuis le retrait : invitation mise en file", () => {
    const d = decider(s, faits({ statutRelation: "a_inviter", invitationEnvoyeeLe: null, dernierRetraitLe: jours(-22) }), R, T0, bas);
    expect(d).toEqual({ mettreEnFile: "invitation", suivi: { ...s, etat: "reinvitation_en_file" } });
  });

  it("jamais avant 21 jours depuis le dernier retrait, même si l'échéance est passée", () => {
    const d = decider(s, faits({ statutRelation: "a_inviter", invitationEnvoyeeLe: null, dernierRetraitLe: jours(-10) }), R, T0, bas);
    expect(d.mettreEnFile).toBeNull();
    expect(d.suivi).toMatchObject({ etat: "attente_reinvitation", prochaineDecisionLe: jours(11) });
  });
});

describe("réinvitation en file", () => {
  const s = suivi({ etat: "reinvitation_en_file", retireeLe: jours(-22) });

  it("invitation partie : un cycle de plus, nouvelle attente du retrait", () => {
    const d = decider(s, faits({ invitationEnvoyeeLe: T0 }), R, T0, bas);
    expect(d).toEqual({
      mettreEnFile: null,
      suivi: { etat: "attente_retrait", cycle: 1, prochaineDecisionLe: jours(21), invitationEnvoyeeLe: T0, retireeLe: null, motif: null },
    });
  });

  it("dernier cycle atteint : mis de côté « relances épuisées », la dernière invitation reste en attente", () => {
    const d = decider({ ...s, cycle: 1 }, faits({ invitationEnvoyeeLe: T0 }), R, T0, bas);
    expect(d.suivi).toMatchObject({ etat: "mis_de_cote", cycle: 2, motif: "relances_epuisees", prochaineDecisionLe: null });
  });

  it("sans limite : la boucle continue", () => {
    const d = decider({ ...s, cycle: 9 }, faits({ invitationEnvoyeeLe: T0 }), { ...R, cycles: null }, T0, bas);
    expect(d.suivi).toMatchObject({ etat: "attente_retrait", cycle: 10 });
  });

  it("invitation refusée ou annulée : nouvel essai dans 7 jours (jamais insistée le jour même)", () => {
    const d = decider(s, faits({ statutRelation: "a_inviter", invitationEnvoyeeLe: null, dernierRetraitLe: jours(-22) }), R, T0, bas);
    expect(d).toEqual({ mettreEnFile: null, suivi: { ...s, etat: "attente_reinvitation", prochaineDecisionLe: jours(7) } });
  });
});

describe("sorties de boucle et reprise", () => {
  it.each([
    [{ statutRelation: "en_relation" as const }, "accepte"],
    [{ statutRelation: "invitation_recue" as const }, "invitation_recue"],
    [{ etapeTerminale: true }, "etape_terminale"],
  ])("%o → terminé (%s), quel que soit l'état", (f, motif) => {
    for (const etat of ["attente_retrait", "retrait_en_file", "attente_reinvitation", "reinvitation_en_file", "mis_de_cote"] as const) {
      const d = decider(suivi({ etat }), faits(f), R, T0, bas);
      expect(d).toEqual({ mettreEnFile: null, suivi: { ...suivi({ etat }), etat: "termine", motif, prochaineDecisionLe: null } });
    }
  });

  it("terminé : définitif", () => {
    const s = suivi({ etat: "termine", motif: "accepte", prochaineDecisionLe: null });
    expect(decider(s, faits(), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: s });
  });

  it("mis de côté puis cycles augmentés : la relance reprend depuis l'invitation en cours", () => {
    const s = suivi({ etat: "mis_de_cote", cycle: 2, motif: "relances_epuisees", prochaineDecisionLe: null, invitationEnvoyeeLe: jours(-30) });
    expect(decider(s, faits({ invitationEnvoyeeLe: jours(-30) }), R, T0, bas)).toEqual({ mettreEnFile: null, suivi: s });
    const d = decider(s, faits({ invitationEnvoyeeLe: jours(-30) }), { ...R, cycles: 3 }, T0, bas);
    expect(d.suivi).toMatchObject({ etat: "attente_retrait", cycle: 2, motif: null, prochaineDecisionLe: jours(-9) });
  });
});
