export type StatutRelation = "en_relation" | "en_attente" | "invitation_recue" | "a_inviter";
export type TypeLien = "relation" | "invitation_envoyee" | "invitation_recue";

export const LIBELLES_STATUT: Record<StatutRelation, string> = {
  en_relation: "En relation 1ᵉʳ degré",
  en_attente: "En attente",
  invitation_recue: "Invitation reçue",
  a_inviter: "À envoyer l'invitation",
};

/**
 * Statut de relation calculé depuis les listes connues (CSV, synchronisations,
 * webhooks), jamais par visite de profil. Priorité : une relation l'emporte sur
 * une invitation, une invitation envoyée sur une invitation reçue.
 */
export function calculerStatutRelation(liens: Iterable<TypeLien>): StatutRelation {
  const types = new Set(liens);
  if (types.has("relation")) return "en_relation";
  if (types.has("invitation_envoyee")) return "en_attente";
  if (types.has("invitation_recue")) return "invitation_recue";
  return "a_inviter";
}
