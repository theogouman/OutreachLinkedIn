import "server-only";
import { envUnipile } from "@/server/env-serveur";
import { creerClientUnipileV2 } from "./client-v2";
import type { ClientLinkedIn, Resultat } from "./types";
import { telechargerPhoto } from "./photo";

/**
 * Client réel seulement si UNIPILE_MODE=reel (production). Sinon (`simule` : Unipile non branché,
 * variable absente ou mal réglée), un client qui refuse tout, sans appel réseau : rien ne peut partir
 * vers LinkedIn. Le worker ne tourne pas dans ce mode et les mises en file sont refusées en amont.
 */
export function clientLinkedIn(): ClientLinkedIn {
  const env = envUnipile();
  if (env.mode === "simule") return clientNonBranche();
  return creerClientUnipileV2({ apiKey: env.apiKey, accountId: env.accountId, baseUrl: env.baseUrl });
}

export function clientNonBranche(): ClientLinkedIn {
  const refus = async (): Promise<Resultat<never>> => ({ ok: false, erreur: { status: 503, type: "unipile_non_branche" } });
  return {
    envoyerMessage: refus,
    demarrerConversation: refus,
    inviter: refus,
    retirerInvitation: refus,
    lireProfil: refus,
    lireConversation: refus,
    lireListe: refus,
    listerConversations: refus,
    listerMessages: refus,
  };
}

/** Lecture de conversation (« Get a Chat ») et téléchargement de photo, pour la complétion des conversations. */
export function dependancesCompletion() {
  const client = clientLinkedIn();
  return { lireConversation: client.lireConversation.bind(client), telechargerPhoto: (url: string) => telechargerPhoto(url) };
}
