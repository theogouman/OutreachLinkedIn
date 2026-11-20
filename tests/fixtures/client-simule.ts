import { createHash, randomUUID } from "node:crypto";
import { ACCEPTEES_DEMO, PROSPECTS_DEMO, providerDemo } from "./demo";
import type { ClientLinkedIn, PersonneListee, ProfilLu } from "@/server/unipile/types";

/**
 * Client LinkedIn simulé, pour les tests uniquement : aucun appel réseau, réponses
 * déterministes alignées sur les données de démonstration (tests/fixtures/demo.ts).
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
    async envoyerMessage(chatId) {
      // Garde-fou : la simulation n'« envoie » que dans les conversations de démonstration.
      if (!chatId.startsWith("demo-chat-")) return { ok: false, erreur: { status: 400, type: "simulation_hors_demo" } };
      return { ok: true, donnees: { messageId: `demo-msg-${randomUUID()}` } };
    },
    async demarrerConversation(providerId) {
      // Garde-fou : la simulation ne « démarre » de conversation qu'avec un prospect de démonstration.
      if (!providerId.startsWith("ACoDEMO")) return { ok: false, erreur: { status: 400, type: "simulation_hors_demo" } };
      return { ok: true, donnees: { chatId: `demo-chat-${randomUUID()}`, messageId: `demo-msg-${randomUUID()}` } };
    },
    async inviter(providerId) {
      // Garde-fou : la simulation n'« invite » qu'un prospect de démonstration.
      if (!providerId.startsWith("ACoDEMO")) return { ok: false, erreur: { status: 400, type: "simulation_hors_demo" } };
      return { ok: true, donnees: { invitationId: `demo-inv-${randomUUID()}` } };
    },
    async retirerInvitation(invitationId) {
      // Simulation : seule une invitation fictive est « retirée ».
      if (!invitationId.startsWith("demo-inv-")) return { ok: false, erreur: { status: 400, type: "simulation_hors_demo" } };
      return { ok: true, donnees: { dejaDisparue: false } };
    },
    async lireConversation() {
      return { ok: true, donnees: { interlocuteurId: null, nom: null, photoUrl: null } };
    },
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
        photoUrl: null,
      };
      return { ok: true, donnees: profil };
    },
    async listerConversations() {
      return { ok: true, donnees: { conversations: [], lus: 0, suivant: null } };
    },
    async listerMessages() {
      return { ok: true, donnees: { messages: [], lus: 0, suivant: null } };
    },
    async lireListe(liste) {
      const source = liste === "relations" ? donnees.relations : liste === "invitations_envoyees" ? donnees.envoyees : donnees.recues;
      return { ok: true, donnees: { personnes: source ?? [], suivant: null } };
    },
  };
}
