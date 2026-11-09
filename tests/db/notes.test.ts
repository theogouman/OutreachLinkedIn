import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { EnvoiRefuse, majNotes } from "@/server/mutations";

describe.skipIf(!TEST_DATABASE_URL)("notes du prospect", () => {
  let db: TestDb;
  let id: string;
  beforeAll(async () => {
    db = await createTestDb();
    id = (
      await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, notes) values ('https://www.linkedin.com/in/ana', 'linkedin.com/in/ana', 'Ancienne') returning id",
      )
    ).rows[0].id;
  });
  afterAll(async () => db?.drop());
  const notes = async () => (await db.pool.query("select notes from public.prospects where id = $1", [id])).rows[0].notes;

  it("enregistre, rogne, et vide la note", async () => {
    await majNotes(db.pool, { prospectId: id, notes: "  Rappeler en janvier  " });
    expect(await notes()).toBe("Rappeler en janvier");
    await majNotes(db.pool, { prospectId: id, notes: "   " });
    expect(await notes()).toBeNull();
  });

  it("refuse une note trop longue, un identifiant invalide ou un prospect inconnu", async () => {
    await expect(majNotes(db.pool, { prospectId: id, notes: "x".repeat(4001) })).rejects.toThrow();
    await expect(majNotes(db.pool, { prospectId: "pas-un-uuid", notes: "x" })).rejects.toThrow();
    await expect(majNotes(db.pool, { prospectId: randomUUID(), notes: "x" })).rejects.toThrow(EnvoiRefuse);
  });
});
