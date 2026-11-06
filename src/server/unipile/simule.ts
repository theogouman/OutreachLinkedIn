import { createHash } from "node:crypto";
import type { ClientLinkedIn, PersonneListee, ProfilLu } from "./types";

/**
 * Client simulé : aucun appel réseau. Utilisé tant que le compte Unipile n'est
 * pas branché, en preview et dans les tests. Réponses déterministes.
 */
export function idSimule(identifiant: string): string {
  return `ACoSIM${createHash("sha256").update(identifiant).digest("hex").slice(0, 16)}`;
}

export function creerClientSimule(donnees: { relations?: PersonneListee[]; envoyees?: PersonneListee[]; recues?: PersonneListee[] } = {}): ClientLinkedIn {
  return {
    async lireProfil(identifiant) {
      const profil: ProfilLu = {
        providerId: identifiant.startsWith("ACo") ? identifiant : idSimule(identifiant),
        publicIdentifier: identifiant.startsWith("ACo") ? null : identifiant,
        prenom: null,
        nom: null,
        titre: null,
        distance: null,
        invitation: null,
      };
      return { ok: true, donnees: profil };
    },
    async lireListe(liste) {
      const source = liste === "relations" ? donnees.relations : liste === "invitations_envoyees" ? donnees.envoyees : donnees.recues;
      return { ok: true, donnees: source ?? [] };
    },
  };
}
