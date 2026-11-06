import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { planifierSynchronisations } from "@/server/queue/planification";
import { dansPlage } from "@/server/queue/temps";

describe.skipIf(!TEST_DATABASE_URL)("planification des synchronisations", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());

  it("une lecture par liste et par jour, dans les plages, jamais deux fois", async () => {
    const jeudi = new Date("2026-11-05T09:00:00Z");
    expect(await planifierSynchronisations(db.pool, jeudi, () => 0.5)).toBe(3);
    expect(await planifierSynchronisations(db.pool, new Date("2026-11-05T10:00:00Z"), () => 0.1)).toBe(0);
    const t = await db.pool.query("select payload, executer_apres from public.taches order by ordre");
    expect(t.rows.map((r) => r.payload.liste)).toEqual(["relations", "invitations_envoyees", "invitations_recues"]);
    const plages = { jours: [1, 2, 3, 4, 5], creneaux: [{ debut: "09:00", fin: "12:30" }, { debut: "14:00", fin: "18:30" }] };
    for (const r of t.rows) expect(dansPlage(r.executer_apres, plages, "Europe/Paris")).toBe(true);
  });

  it("un samedi, les lectures sont planifiées pour lundi", async () => {
    await planifierSynchronisations(db.pool, new Date("2026-11-07T10:00:00Z"), () => 0);
    const t = await db.pool.query("select cle_idempotence, executer_apres from public.taches where cle_idempotence like '%2026-11-09'");
    expect(t.rowCount).toBe(3);
    expect(t.rows[0].executer_apres).toEqual(new Date("2026-11-09T08:00:00Z"));
  });
});
