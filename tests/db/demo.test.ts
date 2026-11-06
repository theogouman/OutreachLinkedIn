import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { DemoDejaChargee, PROSPECTS_DEMO, purgerDemo, semerDemo } from "@/server/demo";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur } from "@/server/unipile/executeur";
import { creerClientSimule } from "@/server/unipile/simule";

// Jeudi 5 novembre 2026, 10h00 à Paris.
const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("données de démonstration", () => {
  let db: TestDb;
  let reelId: string;

  beforeAll(async () => {
    db = await createTestDb();
    // Un vrai prospect, importé avant le branchement d'Unipile.
    const r = await db.pool.query(
      "insert into public.prospects (linkedin_url, url_normalisee, public_identifier) values ('https://www.linkedin.com/in/vraie-personne', 'linkedin.com/in/vraie-personne', 'vraie-personne') returning id",
    );
    reelId = r.rows[0].id;
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres) values ('lecture_profil', $1, '{\"public_identifier\":\"vraie-personne\"}', 'reel', '2026-11-01')",
      [reelId],
    );
  });
  afterAll(async () => db?.drop());

  const tour = (minutes: number) =>
    executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(creerClientSimule()),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => new Date(JEUDI_10H.getTime() + minutes * 60_000),
      aleatoire: () => 0,
      seulementDemo: true,
    });

  it("charge les prospects fictifs, une seule fois", async () => {
    expect(await semerDemo(db.pool, JEUDI_10H)).toEqual({ prospects: PROSPECTS_DEMO.length });
    await expect(semerDemo(db.pool, JEUDI_10H)).rejects.toBeInstanceOf(DemoDejaChargee);
    const n = await db.pool.query("select count(*)::int as n from public.prospects where demo");
    expect(n.rows[0].n).toBe(PROSPECTS_DEMO.length);
    // Les tâches de démo partent tout de suite.
    await db.pool.query("update public.taches set executer_apres = '2026-11-01' where statut = 'en_attente'");
  });

  it("en mode simulé, un vrai prospect n'est jamais traité (pas de faux identifiant)", async () => {
    for (let i = 0; i < 6; i++) await tour(i * 10);
    const reel = await db.pool.query("select provider_id from public.prospects where id = $1", [reelId]);
    expect(reel.rows[0].provider_id).toBeNull();
    const t = await db.pool.query("select statut from public.taches where cle_idempotence = 'reel'");
    expect(t.rows[0].statut).toBe("en_attente");
    // Les lectures de démo, elles, sont passées.
    const lues = await db.pool.query(
      "select count(*)::int as n from public.taches t join public.prospects p on p.id = t.prospect_id where p.demo and t.type_action = 'lecture_profil' and t.statut = 'faite'",
    );
    expect(lues.rows[0].n).toBe(3);
  });

  it("la synchronisation simulée fait accepter deux invitations", async () => {
    await db.pool.query(
      "insert into public.taches (type_action, payload, cle_idempotence, executer_apres) values ('lecture_liste', '{\"liste\":\"relations\"}', 'sync-demo', '2026-11-01')",
    );
    await tour(120);
    const r = await db.pool.query(
      "select public_identifier, statut_relation, etape from public.prospects where public_identifier in ('demo-camille-roux', 'demo-hugo-lefevre') order by 1",
    );
    expect(r.rows).toEqual([
      { public_identifier: "demo-camille-roux", statut_relation: "en_relation", etape: "connecte" },
      { public_identifier: "demo-hugo-lefevre", statut_relation: "en_relation", etape: "connecte" },
    ]);
  });

  it("la purge efface tout, y compris des compteurs de quotas, sans toucher au réel", async () => {
    expect(await purgerDemo(db.pool)).toEqual({ prospects: PROSPECTS_DEMO.length });
    const restes = await db.pool.query(
      `select (select count(*) from public.prospects where demo)::int as prospects,
              (select count(*) from public.actions)::int as actions,
              (select count(*) from public.taches where prospect_id is not null and cle_idempotence <> 'reel')::int as taches,
              (select count(*) from public.liens_linkedin where url_normalisee like 'linkedin.com/in/demo-%')::int as liens`,
    );
    // Les actions restantes éventuelles sont des lectures de listes (sans prospect) : aucune ici.
    expect(restes.rows[0]).toMatchObject({ prospects: 0, taches: 0, liens: 0 });
    const actionsDemo = await db.pool.query("select count(*)::int as n from public.actions where prospect_id is null and type <> 'lecture_liste'");
    expect(actionsDemo.rows[0].n).toBe(0);
    const reel = await db.pool.query("select count(*)::int as n from public.prospects where id = $1", [reelId]);
    expect(reel.rows[0].n).toBe(1);
  });
});
