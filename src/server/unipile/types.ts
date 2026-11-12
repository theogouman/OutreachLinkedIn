import type { ErreurAppel } from "@/server/queue/politique";
import type { MessageUnipile } from "@/server/conversations";

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
  /** Adresse publique de la photo de profil (CDN LinkedIn), si elle existe. */
  photoUrl: string | null;
}

export interface PersonneListee {
  providerId: string;
  publicIdentifier: string | null;
  date: Date | null;
  /** Adresse publique de la photo (CDN LinkedIn), si la liste la donne. */
  photoUrl?: string | null;
  /** Nom affiché, si la liste le donne (rapprochement quand l'URL manque). */
  nom?: string | null;
}

/** Une page d'une liste LinkedIn ; `suivant` : curseur de la page suivante (null : dernière page). */
export interface PageListe {
  personnes: PersonneListee[];
  suivant: string | null;
}

export type Liste = "relations" | "invitations_envoyees" | "invitations_recues";

/** Conversation de la messagerie LinkedIn, lue chez Unipile (synchronisation de la messagerie). */
export interface ConversationListee {
  chatId: string;
  /** Conversation à deux (les groupes ne sont pas repris). */
  aDeux: boolean;
  nonLues: number;
  dernierMessageA: Date | null;
  interlocuteur: { providerId: string | null; publicIdentifier: string | null; nom: string | null; titre: string | null; photoUrl: string | null };
}

/** Une page : `lus` = éléments reçus (y compris ceux écartés car mal formés), pour la pagination. */
export interface PageConversations {
  conversations: ConversationListee[];
  lus: number;
  suivant: string | null;
}
export interface PageMessages {
  messages: MessageUnipile[];
  lus: number;
  suivant: string | null;
}

/** Opérations LinkedIn utilisées par l'outil (lectures, messages, premier message). */
export interface ClientLinkedIn {
  /** Message dans une conversation existante (chat Unipile). Jamais appelé hors de la file. */
  envoyerMessage(chatId: string, texte: string): Promise<Resultat<{ messageId: string | null }>>;
  /**
   * Premier message à une relation de 1er degré (message normal, jamais d'InMail) : démarre
   * la conversation. Jamais appelé hors de la file, ni sans relation vérifiée.
   */
  demarrerConversation(providerId: string, texte: string): Promise<Resultat<{ chatId: string; messageId: string | null }>>;
  lireProfil(identifiant: string): Promise<Resultat<ProfilLu>>;
  /** Interlocuteur d'une conversation à deux (identifiant LinkedIn interne), lu chez Unipile. */
  lireConversation(chatId: string): Promise<Resultat<{ interlocuteurId: string | null; nom: string | null; photoUrl: string | null }>>;
  /**
   * Une page d'une liste (curseur facultatif). Parcours complet réservé à la synchronisation
   * initiale ; ensuite, première page seulement (recommandation Unipile : pas de parcours répété).
   */
  lireListe(liste: Liste, limite: number, curseur?: string, offset?: number): Promise<Resultat<PageListe>>;
  /** Lecture de la messagerie (copie tenue par Unipile, hors quotas LinkedIn) : conversations, plus récentes d'abord. */
  listerConversations(limite: number, curseur?: string, offset?: number): Promise<Resultat<PageConversations>>;
  /** Messages d'une conversation, plus récents d'abord. */
  listerMessages(chatId: string, limite: number, curseur?: string, offset?: number): Promise<Resultat<PageMessages>>;
}
