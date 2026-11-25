import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { basculerNotificationLue, creerNotification, notificationsDepuis, supprimerNotification } from "@/server/notifications";

// Actions serveur appelées pour de vrai : session et connexion remplacées par des doublures.
const etat = vi.hoisted(() => ({ pool: null as unknown, connecte: true }));
vi.mock("@/server/auth", () => ({
  exigerUtilisateur: async () => {
    if (!etat.connecte) throw new Error("NEXT_REDIRECT /login");
    return { email: "theo@example.com" };
  },
}));
vi.mock("@/server/db", () => ({ poolServeur: () => etat.pool }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

describe.skipIf(!TEST_DATABASE_URL)("centre de notifications : lue / non lue et suppression, une par une", () => {
  let db: TestDb;
  let a: string;
  let b: string;
  beforeAll(async () => {
    db = await createTestDb();
    etat.pool = db.pool;
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    etat.connecte = true;
    await db.pool.query("truncate public.notifications");
    await creerNotification(db.pool, { type: "invitation_acceptee", niveau: "info", titre: "Camille a accepté", lien: "/?prospect=x" });
    await creerNotification(db.pool, { type: "compte_deconnecte", niveau: "alerte", titre: "Compte LinkedIn déconnecté" });
    const r = await db.pool.query("select id from public.notifications order by titre");
    [a, b] = r.rows.map((x) => x.id as string) as [string, string];
  });

  it("marque une seule notification lue, puis non lue ; le compteur suit", async () => {
    expect((await notificationsDepuis(db.pool)).nonLues).toBe(2);
    await basculerNotificationLue(db.pool, { id: a, lue: true });
    const apres = await notificationsDepuis(db.pool);
    expect(apres.nonLues).toBe(1);
    expect(apres.liste.find((n) => n.id === a)?.lue).toBe(true);
    expect(apres.liste.find((n) => n.id === b)?.lue).toBe(false);
    await basculerNotificationLue(db.pool, { id: a, lue: false });
    expect((await notificationsDepuis(db.pool)).nonLues).toBe(2);
  });

  it("supprime une seule notification ; entrée invalide refusée, identifiant inconnu sans effet", async () => {
    await supprimerNotification(db.pool, a);
    expect((await notificationsDepuis(db.pool)).liste.map((n) => n.id)).toEqual([b]);
    await supprimerNotification(db.pool, crypto.randomUUID());
    await expect(supprimerNotification(db.pool, "pas-un-uuid")).rejects.toThrow();
    await expect(basculerNotificationLue(db.pool, { id: b, lue: "oui" })).rejects.toThrow();
    await expect(basculerNotificationLue(db.pool, { id: "x", lue: true })).rejects.toThrow();
    expect((await notificationsDepuis(db.pool)).liste).toHaveLength(1);
  });

  it("actions serveur : sans session, refusées avant toute écriture ; connecté, appliquées", async () => {
    const { actionNotificationLue, actionSupprimerNotification } = await import("@/app/actions");
    etat.connecte = false;
    await expect(actionNotificationLue({ id: a, lue: true })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actionSupprimerNotification(a)).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await notificationsDepuis(db.pool)).nonLues).toBe(2);

    etat.connecte = true;
    expect(await actionNotificationLue({ id: a, lue: true })).toMatchObject({ ok: true });
    expect(await actionSupprimerNotification(b)).toMatchObject({ ok: true });
    expect(await actionSupprimerNotification("pas-un-uuid")).toEqual({ ok: false, message: "Valeurs invalides." });
    expect((await notificationsDepuis(db.pool)).liste.map((n) => [n.id, n.lue])).toEqual([[a, true]]);
  });
});
