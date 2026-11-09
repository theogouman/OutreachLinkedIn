import "server-only";
import { z } from "zod";

/**
 * Variables privées, lues uniquement côté serveur et validées à l'usage (le build
 * et la CI tournent sans secrets). Les messages d'erreur nomment les variables,
 * jamais leurs valeurs.
 */
function lire<T extends z.ZodType>(schema: T, valeurs: Record<string, unknown>): z.infer<T> {
  const r = schema.safeParse(valeurs);
  if (!r.success) {
    const noms = [...new Set(r.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Configuration serveur invalide ou manquante : ${noms.join(", ")}`);
  }
  return r.data;
}

export function envBase() {
  return lire(z.object({ DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//) }), {
    DATABASE_URL: process.env.DATABASE_URL,
  });
}

export function envWorker() {
  return lire(z.object({ WORKER_SECRET: z.string().min(32) }), { WORKER_SECRET: process.env.WORKER_SECRET });
}

export type ModeUnipile = "simule" | "reel";

export function envUnipile():
  | { mode: "simule" }
  | { mode: "reel"; apiKey: string; accountId: string; baseUrl: string } {
  const mode = process.env.UNIPILE_MODE === "reel" ? "reel" : "simule";
  if (mode === "simule") return { mode };
  const e = lire(
    z.object({
      UNIPILE_API_KEY: z.string().min(10),
      UNIPILE_ACCOUNT_ID: z.string().min(3),
      UNIPILE_BASE_URL: z.url().default("https://api.unipile.com"),
    }),
    {
      UNIPILE_API_KEY: process.env.UNIPILE_API_KEY,
      UNIPILE_ACCOUNT_ID: process.env.UNIPILE_ACCOUNT_ID,
      UNIPILE_BASE_URL: process.env.UNIPILE_BASE_URL || undefined,
    },
  );
  return { mode, apiKey: e.UNIPILE_API_KEY, accountId: e.UNIPILE_ACCOUNT_ID, baseUrl: e.UNIPILE_BASE_URL };
}

export function envWebhook() {
  return lire(
    // Facultatif : à défaut (ou s'il ne correspond pas), le secret est lu chez Unipile (webhooks/secret.ts).
    z.object({ UNIPILE_WEBHOOK_SECRET: z.string().min(16).optional(), UNIPILE_ACCOUNT_ID: z.string().min(3).optional() }),
    { UNIPILE_WEBHOOK_SECRET: process.env.UNIPILE_WEBHOOK_SECRET || undefined, UNIPILE_ACCOUNT_ID: process.env.UNIPILE_ACCOUNT_ID },
  );
}
