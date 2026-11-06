import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";

/**
 * Base Postgres de test. TEST_DATABASE_URL pointe vers une base « admin » ;
 * chaque fichier de test crée sa propre base jetable, y applique le bootstrap
 * Supabase puis toutes les migrations, et la supprime à la fin.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL est obligatoire en CI : les tests de base ne doivent pas être ignorés.");
}

const root = join(__dirname, "..", "..");

export function migrationsSql(): string[] {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    // Migrations propres à Supabase (pg_cron, Vault) : absentes d'un Postgres nu.
    .filter((sql) => !sql.startsWith("-- @production-uniquement"));
}

export interface TestDb {
  pool: Pool;
  url: string;
  drop: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL manquant");
  const name = `test_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 5 });

  await pool.query(readFileSync(join(root, "supabase", "tests", "bootstrap.sql"), "utf8"));
  for (const sql of migrationsSql()) await pool.query(sql);

  return {
    pool,
    url: url.toString(),
    drop: async () => {
      await pool.end();
      const c = new Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/**
 * Exécute `fn` en tant que rôle `authenticated` avec l'email donné (ou `anon` si
 * email = null, c'est-à-dire un visiteur non connecté), puis annule tout.
 */
export async function asUser<T>(pool: Pool, email: string | null, fn: (c: import("pg").PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(email ? { email, role: "authenticated" } : {}),
    ]);
    await client.query(email ? "set local role authenticated" : "set local role anon");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
