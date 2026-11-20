"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/server/auth";
import { poolServeur } from "@/server/db";
import { annulerTache, basculerArret, EnvoiRefuse, majNotes, majPlafonds, supprimerProspect, majReglages, marquerLue, marquerNonLue, mettreInvitationEnFile, mettreMessageEnFile, modifierPropriete, supprimerConversation, trancherIncertaine } from "@/server/mutations";
import { creerVue, majOptionsVue, renommerVue, supprimerVue } from "@/server/vues";
import { envUnipile } from "@/server/env-serveur";
import { ficheProspectDepuis, filDepuis, inboxDepuis, prospectsDepuis, referentielsDepuis, type FicheProspect, type LigneConversation, type LigneProspect, type MessageFil } from "@/server/donnees";
import { filtresProspectsSchema } from "@/lib/filtres/prospects";
import { filtresInboxSchema } from "@/lib/filtres/inbox";
import { clesPush, enregistrerAbonnement, marquerNotificationsLues, supprimerAbonnement } from "@/server/notifications";

/**
 * Server Actions de l'interface. Chacune vérifie l'utilisateur, valide l'entrée
 * côté serveur et ne renvoie qu'un message générique en cas d'erreur (détails
 * dans les logs serveur uniquement).
 */
export type Retour = { ok: true; message: string } | { ok: false; message: string };

const ERREUR = "Une erreur est survenue. Réessaie dans un instant.";

async function executer(nom: string, fn: () => Promise<string>): Promise<Retour> {
  await exigerUtilisateur();
  try {
    const message = await fn();
    refresh();
    return { ok: true, message };
  } catch (e) {
    if (e instanceof EnvoiRefuse) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: "Valeurs invalides." };
    console.error("[action:%s]", nom, e);
    return { ok: false, message: ERREUR };
  }
}

export async function actionPlafonds(valeurs: unknown): Promise<Retour> {
  return executer("plafonds", async () => {
    await majPlafonds(poolServeur(), valeurs);
    return "Plafonds enregistrés.";
  });
}

export async function actionReglages(valeurs: unknown): Promise<Retour> {
  return executer("reglages", async () => {
    await majReglages(poolServeur(), valeurs);
    return "Réglages enregistrés.";
  });
}

export async function actionArret(arret: boolean): Promise<Retour> {
  return executer("arret", async () => {
    await basculerArret(poolServeur(), arret);
    return arret ? "Toutes les actions sortantes sont suspendues." : "La file reprend.";
  });
}

export async function actionAnnulerTache(id: string): Promise<Retour> {
  return executer("annuler-tache", async () =>
    (await annulerTache(poolServeur(), id)) ? "Tâche annulée." : "Cette tâche est déjà partie ou terminée.",
  );
}

export async function actionTrancher(id: string, decision: string): Promise<Retour> {
  return executer("trancher", async () =>
    (await trancherIncertaine(poolServeur(), id, decision)) ? "Décision enregistrée." : "Cette tâche n'est plus incertaine.",
  );
}

export async function actionMarquerLue(id: string): Promise<Retour> {
  return executer("marquer-lue", async () => ((await marquerLue(poolServeur(), id)) ? "Conversation marquée comme lue." : ""));
}

export async function actionMarquerNonLue(id: unknown): Promise<Retour> {
  return executer("marquer-non-lue", async () =>
    (await marquerNonLue(poolServeur(), id)) ? "Conversation marquée comme non lue." : "Cette conversation est déjà non lue.",
  );
}

/** Suppression dans l'outil seulement : rien n'est effacé sur LinkedIn. */
export async function actionSupprimerConversation(id: unknown): Promise<Retour> {
  return executer("supprimer-conversation", async () => {
    await supprimerConversation(poolServeur(), id);
    return "Conversation supprimée.";
  });
}

/** Message rédigé dans l'outil : mis en file, jamais envoyé directement. */
export async function actionEnvoyerMessage(entree: unknown): Promise<Retour> {
  return executer("envoyerMessage", async () => {
    const r = await mettreMessageEnFile(poolServeur(), entree, { modeSimule: envUnipile().mode === "simule" });
    return r.nouveau ? "Message mis en file d'attente." : "Ce message est déjà en file d'attente.";
  });
}

/** Invitation demandée depuis la fiche : mise en file, jamais envoyée directement. */
export async function actionInviterProspect(entree: unknown): Promise<Retour> {
  return executer("inviter", async () => {
    const r = await mettreInvitationEnFile(poolServeur(), entree, { modeSimule: envUnipile().mode === "simule" });
    return r.nouveau ? "Invitation mise en file d'attente." : "Cette invitation est déjà en file d'attente.";
  });
}

// ─── Fiches voisines (glisser entre profils sur téléphone) ─────────────────────

export type DonneesFiche = {
  fiche: FicheProspect;
  libelleEtape: string;
  conversation: { id: string | null; messages: MessageFil[] } | null;
};

/**
 * Lecture seule d'une fiche, pour la précharger (fiches précédente et suivante de la liste) :
 * utilisateur vérifié, identifiant validé, aucune écriture ni rafraîchissement de la page.
 */
export async function actionLireFiche(id: unknown): Promise<DonneesFiche | null> {
  await exigerUtilisateur();
  const prospectId = z.uuid().safeParse(id);
  if (!prospectId.success) return null;
  try {
    const pool = poolServeur();
    const [fiche, refs, conversation] = await Promise.all([
      ficheProspectDepuis(pool, prospectId.data),
      referentielsDepuis(pool),
      filDepuis(pool, { prospectId: prospectId.data }),
    ]);
    if (!fiche) return null;
    const libelleEtape = refs.etapes.find((e) => e.code === fiche.etape)?.libelle ?? fiche.etape;
    return { fiche, libelleEtape, conversation };
  } catch (e) {
    console.error("[action:%s]", "lire-fiche", e);
    return null;
  }
}

// ─── Vues de la liste Prospects et propriétés modifiables ──────────────────────

/** Nouvelle vue d'un type du catalogue ; renvoie son identifiant pour l'ouvrir aussitôt. */
export async function actionCreerVue(entree: unknown): Promise<Retour & { id?: string }> {
  let id: string | undefined;
  const r = await executer("creer-vue", async () => {
    id = await creerVue(poolServeur(), entree);
    return "Vue créée.";
  });
  return r.ok ? { ...r, id } : r;
}

export async function actionRenommerVue(entree: unknown): Promise<Retour> {
  return executer("renommer-vue", async () => {
    await renommerVue(poolServeur(), entree);
    return "Vue renommée.";
  });
}

export async function actionReglerVue(entree: unknown): Promise<Retour> {
  return executer("regler-vue", async () => {
    await majOptionsVue(poolServeur(), entree);
    return "Vue mise à jour.";
  });
}

export async function actionSupprimerVue(id: unknown): Promise<Retour> {
  return executer("supprimer-vue", async () => {
    await supprimerVue(poolServeur(), id);
    return "Vue supprimée.";
  });
}

/** Propriété modifiée sur place depuis une vue (seules celles déclarées modifiables). */
export async function actionModifierPropriete(entree: unknown): Promise<Retour> {
  return executer("modifier-propriete", async () => {
    await modifierPropriete(poolServeur(), entree);
    return "Modification enregistrée.";
  });
}

/** Notes de la fiche : enregistrées sans recharger la page (la fiche reste ouverte). */
export async function actionModifierNotes(entree: unknown): Promise<Retour> {
  await exigerUtilisateur();
  try {
    await majNotes(poolServeur(), entree);
    return { ok: true, message: "Notes enregistrées." };
  } catch (e) {
    if (e instanceof EnvoiRefuse) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Valeurs invalides." };
    console.error("[action:%s]", "notes", e);
    return { ok: false, message: ERREUR };
  }
}

export async function actionSupprimerProspect(id: unknown): Promise<Retour> {
  return executer("supprimer-prospect", async () => {
    await supprimerProspect(poolServeur(), id);
    return "Prospect supprimé, avec toutes ses données.";
  });
}

// ─── Notifications et Push ────────────────────────────────────────────────────

export async function actionNotificationsLues(): Promise<Retour> {
  return executer("notifications-lues", async () => {
    await marquerNotificationsLues(poolServeur());
    return "Notifications lues.";
  });
}

/** Clé publique VAPID (publique par nature) pour abonner cet appareil. */
export async function actionClePush(): Promise<string> {
  await exigerUtilisateur();
  return (await clesPush(poolServeur())).publique;
}

export async function actionAbonnerPush(abonnement: unknown): Promise<Retour> {
  return executer("abonner-push", async () => {
    await enregistrerAbonnement(poolServeur(), abonnement);
    return "Notifications activées sur cet appareil.";
  });
}

export async function actionDesabonnerPush(endpoint: unknown): Promise<Retour> {
  return executer("desabonner-push", async () => {
    await supprimerAbonnement(poolServeur(), endpoint);
    return "Notifications désactivées sur cet appareil.";
  });
}

// ─── Listes filtrées (standard : src/lib/filtres) ─────────────────────────────
// Lecture seule, sans refresh() ni changement d'URL : le client garde ses filtres en état
// et remplace la liste par la réponse.

export type ResultatListe<L> = { ok: true; lignes: L[]; total: number } | { ok: false; message: string };

export async function actionListerProspects(entree: unknown): Promise<ResultatListe<LigneProspect>> {
  await exigerUtilisateur();
  const filtres = filtresProspectsSchema.safeParse(entree);
  if (!filtres.success) return { ok: false, message: "Filtres invalides." };
  try {
    return { ok: true, ...(await prospectsDepuis(poolServeur(), filtres.data)) };
  } catch (e) {
    console.error("[action:listerProspects]", e);
    return { ok: false, message: ERREUR };
  }
}

export async function actionListerConversations(entree: unknown): Promise<ResultatListe<LigneConversation>> {
  await exigerUtilisateur();
  const filtres = filtresInboxSchema.safeParse(entree);
  if (!filtres.success) return { ok: false, message: "Filtres invalides." };
  try {
    return { ok: true, ...(await inboxDepuis(poolServeur(), filtres.data)) };
  } catch (e) {
    console.error("[action:listerConversations]", e);
    return { ok: false, message: ERREUR };
  }
}
