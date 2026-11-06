import type { ErreurAppel } from "@/server/queue/politique";

export type Resultat<T> = { ok: true; donnees: T } | { ok: false; erreur: ErreurAppel };

export type DistanceReseau = "SELF" | "FIRST_DEGREE" | "SECOND_DEGREE" | "THIRD_DEGREE" | "OUT_OF_NETWORK";

export interface ProfilLu {
  providerId: string;
  publicIdentifier: string | null;
  prenom: string | null;
  nom: string | null;
  titre: string | null;
  distance: DistanceReseau | null;
  /** Invitation en attente entre le compte et ce profil, si LinkedIn la signale. */
  invitation: "envoyee" | "recue" | null;
}

export interface PersonneListee {
  providerId: string;
  publicIdentifier: string | null;
  date: Date | null;
}

export type Liste = "relations" | "invitations_envoyees" | "invitations_recues";

/** Opérations LinkedIn utilisées par l'outil (phase 1 : lectures uniquement). */
export interface ClientLinkedIn {
  lireProfil(identifiant: string): Promise<Resultat<ProfilLu>>;
  /** Première page uniquement (recommandation Unipile : pas de parcours complet répété). */
  lireListe(liste: Liste, limite: number): Promise<Resultat<PersonneListee[]>>;
}
