import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { ficheProspectDepuis } from "@/server/donnees";
import { supprimerProspect } from "@/server/mutations";

const AUTORISE = "theo@example.com";

describe.skipIf(!TEST_DATABASE_URL)("profils LinkedIn (enrichissement de la fiche)", () => {
  let db: TestDb;
  let id: string;
  beforeAll(async () => {
    db = await createTestDb();
    await db.pool.query("insert into public.utilisateurs_autorises (email) values ($1)", [AUTORISE]);
    id = (
      await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, poste, entreprise) values ('https://www.linkedin.com/in/bruno', 'linkedin.com/in/bruno', 'Co-founder', 'Grizzly') returning id",
      )
    ).rows[0].id;
    await db.pool.query(
      `insert into public.profils_linkedin (prospect_id, source, lu_le, titre, localisation, email, entreprise, experiences, formation)
       values ($1, 'apify', '2026-11-12T16:18:00Z', 'Co-founder, The Grizzly Labs', 'Paris', 'bruno@example.com',
               '{"nom":"The Grizzly Labs","site":"javascript:alert(1)"}', '[{"poste":"Co-founder","entreprise":"The Grizzly Labs"}]', '[]')`,
      [id],
    );
  });
  afterAll(async () => db?.drop());

  it("la fiche porte le profil, revalidé (lien non https écarté)", async () => {
    const f = await ficheProspectDepuis(db.pool, id);
    expect(f?.profil).toMatchObject({ titre: "Co-founder, The Grizzly Labs", localisation: "Paris", email: "bruno@example.com" });
    expect(f?.profil?.entreprise).toMatchObject({ nom: "The Grizzly Labs", site: null });
    expect(f?.profil?.experiences.map((e) => e.poste)).toEqual(["Co-founder"]);
  });

  it("fiche sans profil : null", async () => {
    const autre = (
      await db.pool.query("insert into public.prospects (linkedin_url, url_normalisee) values ('https://www.linkedin.com/in/zoe', 'linkedin.com/in/zoe') returning id")
    ).rows[0].id;
    expect((await ficheProspectDepuis(db.pool, autre))?.profil).toBeNull();
  });

  it("accès : lecture pour l'utilisateur autorisé seulement, aucune écriture depuis l'interface", async () => {
    const lu = await asUser(db.pool, AUTORISE, (c) => c.query("select count(*)::int as n from public.profils_linkedin"));
    expect(lu.rows[0].n).toBe(1);
    const intrus = await asUser(db.pool, "intrus@example.com", (c) => c.query("select count(*)::int as n from public.profils_linkedin"));
    expect(intrus.rows[0].n).toBe(0);
    await expect(asUser(db.pool, null, (c) => c.query("select * from public.profils_linkedin"))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db.pool, AUTORISE, (c) => c.query("update public.profils_linkedin set email = 'x@y.z'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("suppression du prospect : son profil part avec lui", async () => {
    await supprimerProspect(db.pool, id);
    const r = await db.pool.query("select count(*)::int as n from public.profils_linkedin where prospect_id = $1", [id]);
    expect(r.rows[0].n).toBe(0);
  });
});
