"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/server/auth";
import { poolServeur } from "@/server/db";
import { importerProspects, importerRelations } from "@/server/import/appliquer";
import { ErreurImport, lireConnectionsCsv, TAILLE_MAX_OCTETS } from "@/server/import/connections-csv";
import { correspondanceSchema, lireProspectsCsv } from "@/server/import/prospects-csv";
import { annulerTache, basculerArret, EnvoiRefuse, majPlafonds, majReglages, marquerLue, mettreMessageEnFile, trancherIncertaine } from "@/server/mutations";
import { DemoDejaChargee, purgerDemo, semerDemo } from "@/server/demo";
import { envUnipile } from "@/server/env-serveur";
import { inboxDepuis, prospectsDepuis, type LigneConversation, type LigneProspect } from "@/server/donnees";
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
    if (e instanceof ErreurImport || e instanceof DemoDejaChargee || e instanceof EnvoiRefuse) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: "Valeurs invalides." };
    console.error("[action:%s]", nom, e);
    return { ok: false, message: ERREUR };
  }
}

async function lireFichier(formData: FormData): Promise<string> {
  const f = formData.get("fichier");
  if (!(f instanceof File) || f.size === 0) throw new ErreurImport("Aucun fichier reçu.");
  if (f.size > TAILLE_MAX_OCTETS) throw new ErreurImport("Fichier trop volumineux (5 Mo maximum).");
  if (!/\.csv$/i.test(f.name)) throw new ErreurImport("Le fichier doit être un .csv.");
  return f.text();
}

export async function actionImporterRelations(formData: FormData): Promise<Retour> {
  return executer("importer-relations", async () => {
    const lecture = lireConnectionsCsv(await lireFichier(formData));
    const r = await importerRelations(poolServeur(), lecture.relations);
    return `${r.relations} relations lues, ${r.prospectsMisAJour} prospects mis à jour, ${r.etapesAvancees} passés à « Connecté »${lecture.lignesRejetees ? `, ${lecture.lignesRejetees} lignes sans URL ignorées` : ""}.`;
  });
}

export async function actionImporterProspects(formData: FormData): Promise<Retour> {
  return executer("importer-prospects", async () => {
    const correspondance = correspondanceSchema.parse(JSON.parse(String(formData.get("correspondance") ?? "{}")));
    const liste = z.string().trim().max(100).parse(String(formData.get("liste") ?? "")) || null;
    const lecture = lireProspectsCsv(await lireFichier(formData), correspondance);
    const r = await importerProspects(poolServeur(), lecture.prospects, liste);
    return `${r.crees} prospects créés, ${r.dejaPresents} déjà présents, ${r.lecturesEnFile} lectures de profil mises en file${lecture.lignesRejetees ? `, ${lecture.lignesRejetees} lignes sans URL LinkedIn valide` : ""}.`;
  });
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

export async function actionChargerDemo(): Promise<Retour> {
  return executer("charger-demo", async () => {
    if (envUnipile().mode !== "simule") throw new ErreurImport("Données de démonstration indisponibles : Unipile est branché.");
    const r = await semerDemo(poolServeur());
    return `${r.prospects} prospects fictifs chargés.`;
  });
}

export async function actionPurgerDemo(): Promise<Retour> {
  return executer("purger-demo", async () => {
    const r = await purgerDemo(poolServeur());
    return r.prospects ? `${r.prospects} prospects fictifs supprimés, historique compris.` : "Aucune donnée de démonstration.";
  });
}

export async function actionMarquerLue(id: string): Promise<Retour> {
  return executer("marquer-lue", async () => ((await marquerLue(poolServeur(), id)) ? "Conversation marquée comme lue." : ""));
}

/** Message rédigé dans l'outil : mis en file, jamais envoyé directement. */
export async function actionEnvoyerMessage(entree: unknown): Promise<Retour> {
  return executer("envoyerMessage", async () => {
    const r = await mettreMessageEnFile(poolServeur(), entree, { modeSimule: envUnipile().mode === "simule" });
    return r.nouveau ? "Message mis en file d'attente." : "Ce message est déjà en file d'attente.";
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
