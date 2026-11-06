import { describe, expect, it } from "vitest";
import {
  choisirTache,
  classerErreur,
  GEL_24H_MS,
  peutExecuter,
  tirerDelai,
  type ContexteDecision,
  type TacheCandidate,
  type TypeQuota,
} from "./politique";

const TZ = "Europe/Paris";
// Jeudi 5 novembre 2026, 10h00 à Paris (dans la plage du matin).
const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

function ctx(over: Partial<ContexteDecision> = {}, compteurs: Partial<Record<TypeQuota, Partial<{ jour: number; semaine: number; mois: number }>>> = {}): ContexteDecision {
  const zero = { jour: 0, semaine: 0, mois: 0 };
  const base: ContexteDecision = {
    maintenant: JEUDI_10H,
    reglages: {
      fuseau: TZ,
      plages: {
        jours: [1, 2, 3, 4, 5],
        creneaux: [
          { debut: "09:00", fin: "12:30" },
          { debut: "14:00", fin: "18:30" },
        ],
      },
      arretDurgence: false,
      prochaineActionPossibleA: null,
    },
    quotas: {
      invitation: { plafond: { jour: 20, semaine: 100, mois: null }, gelJusqua: null },
      note_invitation: { plafond: { jour: null, semaine: null, mois: 4 }, gelJusqua: null },
      lecture_profil: { plafond: { jour: 40, semaine: null, mois: null }, gelJusqua: null },
      message: { plafond: { jour: 50, semaine: null, mois: null }, gelJusqua: null },
      lecture_liste: { plafond: { jour: 3, semaine: null, mois: null }, gelJusqua: null },
    },
    compteurs: {
      invitation: { ...zero, ...compteurs.invitation },
      note_invitation: { ...zero, ...compteurs.note_invitation },
      lecture_profil: { ...zero, ...compteurs.lecture_profil },
      message: { ...zero, ...compteurs.message },
      lecture_liste: { ...zero, ...compteurs.lecture_liste },
    },
  };
  return { ...base, ...over, reglages: { ...base.reglages, ...over.reglages } };
}

const invitation: TacheCandidate = { id: "t1", typeAction: "invitation", avecNote: false };
const invitationNote: TacheCandidate = { id: "t2", typeAction: "invitation", avecNote: true };
const message: TacheCandidate = { id: "t3", typeAction: "message", avecNote: false };

describe("plafonds : une tâche ne part jamais au-delà", () => {
  it("part sous le plafond", () => {
    expect(peutExecuter(invitation, ctx({}, { invitation: { jour: 19, semaine: 99 } }))).toEqual({ autorise: true });
  });

  it("bloquée au plafond du jour, nouvel essai au premier créneau du lendemain", () => {
    const d = peutExecuter(invitation, ctx({}, { invitation: { jour: 20 } }));
    expect(d).toMatchObject({ autorise: false, motif: "quota_jour", quota: "invitation" });
    // vendredi 6 novembre, 9h00 Paris
    expect(!d.autorise && d.reessayerA?.toISOString()).toBe("2026-11-06T08:00:00.000Z");
  });

  it("bloquée au plafond de la semaine, nouvel essai lundi 9h", () => {
    const d = peutExecuter(invitation, ctx({}, { invitation: { jour: 3, semaine: 100 } }));
    expect(d).toMatchObject({ autorise: false, motif: "quota_semaine" });
    expect(!d.autorise && d.reessayerA?.toISOString()).toBe("2026-11-09T08:00:00.000Z");
  });

  it("une invitation avec note respecte aussi le quota mensuel de notes", () => {
    const c = ctx({}, { note_invitation: { mois: 4 } });
    expect(peutExecuter(invitationNote, c)).toMatchObject({ autorise: false, motif: "quota_mois", quota: "note_invitation" });
    // Sans note, l'invitation peut partir.
    expect(peutExecuter(invitation, c)).toEqual({ autorise: true });
    const d = peutExecuter(invitationNote, c);
    expect(!d.autorise && d.reessayerA?.toISOString()).toBe("2026-12-01T08:00:00.000Z"); // mardi 1er déc. 9h
  });

  it("plafond à 0 = aucun envoi", () => {
    const c = ctx();
    c.quotas.message.plafond.jour = 0;
    expect(peutExecuter(message, c)).toMatchObject({ autorise: false, motif: "quota_jour" });
  });
});

describe("plages horaires : aucune action hors plage", () => {
  it.each([
    ["avant 9h", "2026-11-05T07:30:00Z", "2026-11-05T08:00:00.000Z"],
    ["pause de midi", "2026-11-05T11:45:00Z", "2026-11-05T13:00:00.000Z"],
    ["samedi", "2026-11-07T10:00:00Z", "2026-11-09T08:00:00.000Z"],
  ])("%s → refusée, nouvel essai au prochain créneau", (_, quand, prochain) => {
    const d = peutExecuter(message, ctx({ maintenant: new Date(quand) }));
    expect(d).toMatchObject({ autorise: false, motif: "hors_plage" });
    expect(!d.autorise && d.reessayerA?.toISOString()).toBe(prochain);
  });

  it("aucune plage configurée → rien ne part", () => {
    expect(peutExecuter(message, ctx({ reglages: { plages: { jours: [], creneaux: [] } } as never }))).toMatchObject({
      autorise: false,
      motif: "aucune_plage",
    });
  });
});

describe("gel sur erreur", () => {
  it("un type gelé ne part pas ; les autres types continuent", () => {
    const c = ctx();
    c.quotas.invitation.gelJusqua = new Date(JEUDI_10H.getTime() + GEL_24H_MS);
    expect(peutExecuter(invitation, c)).toMatchObject({ autorise: false, motif: "gel", quota: "invitation" });
    expect(peutExecuter(message, c)).toEqual({ autorise: true });
  });

  it("le gel expiré n'empêche plus rien", () => {
    const c = ctx();
    c.quotas.invitation.gelJusqua = new Date(JEUDI_10H.getTime() - 1);
    expect(peutExecuter(invitation, c)).toEqual({ autorise: true });
  });

  it.each([
    [{ status: 422, type: "cannot_resend_yet" }, "gel"],
    [{ status: 429, type: "provider/too_many_requests" }, "gel"],
    [{ status: 500 }, "gel"],
    [{ status: 503 }, "gel"],
    [{ status: 429, type: "api/too_many_requests", retryAfterS: 30 }, "reessayer"],
    [{ status: 404 }, "echec_definitif"],
    [{ status: null }, "incertain"],
  ] as const)("classerErreur(%o) → %s", (erreur, genre) => {
    expect(classerErreur(erreur).genre).toBe(genre);
  });

  it("le gel dure 24 h", () => {
    expect(classerErreur({ status: 429, type: "provider/too_many_requests" })).toEqual({ genre: "gel", duree_ms: GEL_24H_MS });
  });
});

describe("bouton d'arrêt", () => {
  it("suspend tout, quel que soit le type", () => {
    const c = ctx({ reglages: { arretDurgence: true } as never });
    for (const t of [invitation, message]) {
      expect(peutExecuter(t, c)).toEqual({ autorise: false, motif: "arret_d_urgence", reessayerA: null });
    }
    const choix = choisirTache([invitation, message], c);
    expect(choix.tache).toBeNull();
    expect(choix.attentes.get("t1")?.motif).toBe("arret_d_urgence");
  });
});

describe("espacement entre deux actions", () => {
  it("attend la prochaine action possible", () => {
    const possible = new Date(JEUDI_10H.getTime() + 90_000);
    const d = peutExecuter(message, ctx({ reglages: { prochaineActionPossibleA: possible } as never }));
    expect(d).toEqual({ autorise: false, motif: "espacement", reessayerA: possible });
  });

  it("tire un délai dans les bornes", () => {
    expect(tirerDelai(120, 360, () => 0)).toBe(120);
    expect(tirerDelai(120, 360, () => 0.999999)).toBe(360);
    expect(() => tirerDelai(400, 100)).toThrow();
  });
});

describe("choix dans la file", () => {
  it("prend la première candidate exécutable, dans l'ordre", () => {
    const choix = choisirTache([invitation, message], ctx());
    expect(choix.tache?.id).toBe("t1");
  });

  it("une invitation bloquée par son quota ne bloque pas un message derrière elle", () => {
    const choix = choisirTache([invitation, message], ctx({}, { invitation: { jour: 20 } }));
    expect(choix.tache?.id).toBe("t3");
    expect(choix.attentes.get("t1")?.motif).toBe("quota_jour");
  });

  it("aucune candidate exécutable → rien ne part, motifs renseignés", () => {
    const choix = choisirTache([invitation], ctx({}, { invitation: { semaine: 100 } }));
    expect(choix.tache).toBeNull();
    expect(choix.attentes.get("t1")?.motif).toBe("quota_semaine");
  });
});
