import "server-only";
import { envUnipile } from "@/server/env-serveur";
import { creerClientUnipileV2 } from "./client-v2";
import { creerClientSimule } from "./simule";
import type { ClientLinkedIn } from "./types";
import { telechargerPhoto } from "./photo";

/** Client réel seulement si UNIPILE_MODE=reel (production) ; simulé partout ailleurs. */
export function clientLinkedIn(): ClientLinkedIn {
  const env = envUnipile();
  if (env.mode === "simule") return creerClientSimule();
  return creerClientUnipileV2({ apiKey: env.apiKey, accountId: env.accountId, baseUrl: env.baseUrl });
}

/** Lecture de conversation (« Get a Chat ») et téléchargement de photo, pour la complétion des conversations. */
export function dependancesCompletion() {
  const client = clientLinkedIn();
  return { lireConversation: client.lireConversation.bind(client), telechargerPhoto: (url: string) => telechargerPhoto(url) };
}
