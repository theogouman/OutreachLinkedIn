import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";

describe.skipIf(!TEST_DATABASE_URL)("photos de profil en base", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    const p = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee) values ('https://www.linkedin.com/in/zoe', 'linkedin.com/in/zoe') returning id",
    );
    await db.pool.query("insert into public.photos_prospects (prospect_id, contenu, type_mime) values ($1, '\\xffd8ff00', 'image/jpeg')", [p.rows[0].id]);
  });
  afterAll(async () => db?.drop());

  it("ni un visiteur non connecté ni un autre utilisateur ne lisent les photos, et personne ne les écrit", async () => {
    await expect(asUser(db.pool, null, (c) => c.query("select 1 from public.photos_prospects"))).rejects.toThrow(/permission denied/);
    const intrus = await asUser(db.pool, "intrus@example.com", (c) => c.query("select 1 from public.photos_prospects"));
    expect(intrus.rows).toEqual([]);
    await expect(
      asUser(db.pool, "intrus@example.com", (c) => c.query("delete from public.photos_prospects")),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuse un type de fichier non prévu ou une photo trop lourde, et suit la suppression du prospect", async () => {
    const p = await db.pool.query("select id from public.prospects limit 1");
    await expect(
      db.pool.query("update public.photos_prospects set type_mime = 'image/svg+xml' where prospect_id = $1", [p.rows[0].id]),
    ).rejects.toThrow();
    await expect(
      db.pool.query("update public.photos_prospects set contenu = decode(repeat('00', 400000), 'hex') where prospect_id = $1", [p.rows[0].id]),
    ).rejects.toThrow();
    await db.pool.query("delete from public.prospects where id = $1", [p.rows[0].id]);
    expect((await db.pool.query("select count(*)::int n from public.photos_prospects")).rows[0].n).toBe(0);
  });
});
