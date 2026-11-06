import "server-only";
import { Pool, type PoolConfig } from "pg";
import { envBase } from "./env-serveur";

/**
 * Connexion directe à Postgres (rôle de service, hors RLS) pour le worker, les
 * imports et les webhooks. Toujours précédée d'une vérification d'accès
 * (exigerUtilisateur, secret du worker, signature du webhook).
 */
let pool: Pool | undefined;

export function configTls(url: string, caPem: string | undefined): PoolConfig["ssl"] {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  // Le certificat de Supabase est signé par l'autorité Supabase (« Supabase Root 2021 CA ») :
  // on l'exige pour vérifier le serveur, plutôt que de désactiver la vérification.
  if (!caPem) {
    throw new Error("Configuration serveur invalide ou manquante : DATABASE_CA_CERT");
  }
  return { ca: caPem.replace(/\\n/g, "\n"), rejectUnauthorized: true };
}

export function poolServeur(): Pool {
  if (!pool) {
    const { DATABASE_URL } = envBase();
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: configTls(DATABASE_URL, process.env.DATABASE_CA_CERT),
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}
