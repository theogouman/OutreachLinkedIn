import "server-only";
import { envUnipile } from "@/server/env-serveur";
import { creerClientUnipileV2 } from "./client-v2";
import { creerClientSimule } from "./simule";
import type { ClientLinkedIn } from "./types";

/** Client réel seulement si UNIPILE_MODE=reel (production) ; simulé partout ailleurs. */
export function clientLinkedIn(): ClientLinkedIn {
  const env = envUnipile();
  if (env.mode === "simule") return creerClientSimule();
  return creerClientUnipileV2({ apiKey: env.apiKey, accountId: env.accountId, baseUrl: env.baseUrl });
}
