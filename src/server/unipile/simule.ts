import { createHash } from "node:crypto";
import { ACCEPTEES_DEMO, PROSPECTS_DEMO, providerDemo } from "@/server/demo";
import type { ClientLinkedIn, PersonneListee, ProfilLu } from "./types";

/**
 * Client simulé : aucun appel réseau. Utilisé tant que le compte Unipile n'est
 * pas branché, en preview et dans les tests. Réponses déterministes, alignées
 * sur les données de démonstration (src/server/demo.ts).
 */
export function idSimule(identifiant: string): string {
  if (identifiant.startsWith("demo-")) return providerDemo(identifiant);
  return `ACoSIM${createHash("sha256").update(identifiant).digest("hex").slice(0, 16)}`;
}

const personne = (id: string): PersonneListee => ({ providerId: providerDemo(id), publicIdentifier: id, date: null });

/** Listes LinkedIn simulées : deux invitations en attente y apparaissent acceptées. */
export const LISTES_DEMO = {
  relations: [
    ...PROSPECTS_DEMO.filter((p) => p.statut === "en_relation").map((p) => p.id),
    ...ACCEPTEES_DEMO,
  ].map(personne),
  envoyees: PROSPECTS_DEMO.filter((p) => p.statut === "en_attente" && !ACCEPTEES_DEMO.includes(p.id)).map((p) => personne(p.id)),
  recues: PROSPECTS_DEMO.filter((p) => p.statut === "invitation_recue").map((p) => personne(p.id)),
};

export function creerClientSimule(
  donnees: { relations?: PersonneListee[]; envoyees?: PersonneListee[]; recues?: PersonneListee[] } = LISTES_DEMO,
): ClientLinkedIn {
  return {
    async lireProfil(identifiant) {
      const demo = PROSPECTS_DEMO.find((p) => p.id === identifiant);
      const profil: ProfilLu = {
        providerId: identifiant.startsWith("ACo") ? identifiant : idSimule(identifiant),
        publicIdentifier: identifiant.startsWith("ACo") ? null : identifiant,
        prenom: demo?.prenom ?? null,
        nom: demo?.nom ?? null,
        titre: demo ? `${demo.poste} chez ${demo.entreprise}` : null,
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
