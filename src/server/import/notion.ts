import "server-only";
import { z } from "zod";
import { normaliserUrlLinkedIn } from "@/lib/linkedin-url";
import { champsDeListe } from "@/lib/listes";
import { instantLocal } from "@/server/queue/temps";

/*
 * Import unique du CRM Notion (bases Contacts, Logs, Entreprises), à partir d'un export JSON
 * produit par un script de lecture de l'API Notion. Donnée non fiable : tout est validé et borné.
 *
 * Règles (décidées avec l'utilisateur) :
 * - ignorés : « À vérifier », « Exclu », contacts sans Signal, sans URL LinkedIn valide ;
 * - liste d'origine = Signal ; informations propres à la liste dans `details` (src/lib/listes.ts) ;
 * - Statut → étape : À contacter / vide → à contacter ; Invitation en attente → invitation envoyée ;
 *   Contacté → premier message ; En discussion → répondu ; Gagné / Perdu → gagné / perdu ;
 * - Logs « Invitation envoyée » / « Message N°x envoyé » → actions datées (comptées dans les quotas,
 *   comme LinkedIn les compte), à midi heure de Paris faute d'heure dans Notion.
 */

const texte = (max: number) =>
  z
    .string()
    .max(max * 4)
    .nullish()
    .transform((v) => {
      const t = v?.trim();
      return t ? t.slice(0, max) : null;
    });

const MAX_DETAIL_IMPORT = 500;

const contactSchema = z.object({
  id: z.string().min(1).max(64),
  nom: texte(200),
  prenom: texte(100),
  role: texte(300),
  linkedin: texte(500),
  statut: texte(60),
  signal: texte(100),
  notes: texte(2000),
  // 3 × 500 caractères (≤ 4 octets chacun) tiennent sous la limite de 8 Ko de prospects.details.
  requete: texte(MAX_DETAIL_IMPORT),
  usageNotion: texte(MAX_DETAIL_IMPORT),
  pageNotion: texte(MAX_DETAIL_IMPORT),
  entreprise: z
    .object({ nom: texte(200), angle: texte(1000), lot: texte(100) })
    .nullish()
    .transform((v) => v ?? null),
});

const logSchema = z.object({
  id: z.string().min(1).max(64),
  contactId: z.string().min(1).max(64),
  evenement: texte(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const exportNotionSchema = z.object({
  version: z.literal(1),
  contacts: z.array(contactSchema).max(10_000),
  logs: z.array(logSchema).max(50_000),
});

export type ExportNotion = z.infer<typeof exportNotionSchema>;

const ETAPES: Record<string, { etape: string; lien: "invitation_envoyee" | "relation" | null }> = {
  "À contacter": { etape: "a_contacter", lien: null },
  "Invitation en attente": { etape: "invitation_envoyee", lien: "invitation_envoyee" },
  Contacté: { etape: "premier_message", lien: "relation" },
  "En discussion": { etape: "repondu", lien: "relation" },
  Gagné: { etape: "gagne", lien: "relation" },
  Perdu: { etape: "perdu", lien: null },
};

export interface ProspectNotion {
  linkedinUrl: string;
  urlNormalisee: string;
  publicIdentifier: string;
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  entreprise: string | null;
  listeOrigine: string;
  etape: string;
  notes: string | null;
  details: Record<string, string>;
  /** Lien LinkedIn déjà connu d'après Notion (statut de relation recalculé ensuite). */
  lien: { type: "invitation_envoyee" | "relation"; date: Date | null } | null;
}

export interface ActionNotion {
  logId: string;
  urlNormalisee: string;
  type: "invitation" | "message";
  date: Date;
}

export interface ImportNotionPrepare {
  prospects: ProspectNotion[];
  actions: ActionNotion[];
  ignores: { aVerifier: number; exclus: number; sansSignal: number; sansLinkedIn: number; statutInconnu: number; doublons: number };
}

/** "2026-11-04" → 12 h, heure de Paris. */
export function dateLog(jour: string): Date {
  const [a, m, j] = jour.split("-").map(Number) as [number, number, number];
  return instantLocal(a, m, j, 12, 0, "Europe/Paris");
}

function separerNom(complet: string | null, prenom: string | null): { prenom: string | null; nom: string | null } {
  if (!complet) return { prenom, nom: null };
  if (prenom && complet.startsWith(prenom)) return { prenom, nom: complet.slice(prenom.length).trim() || null };
  if (prenom) return { prenom, nom: complet };
  const [premier, ...reste] = complet.split(/\s+/);
  return { prenom: premier ?? null, nom: reste.join(" ") || null };
}

function typeAction(evenement: string | null): ActionNotion["type"] | null {
  if (evenement === "Invitation envoyée") return "invitation";
  if (evenement && /^Message N°\d+ envoyé$/.test(evenement)) return "message";
  return null;
}

/** Règles pures : export validé → prospects, liens et actions à écrire. */
export function preparerImportNotion(entree: ExportNotion): ImportNotionPrepare {
  const ignores = { aVerifier: 0, exclus: 0, sansSignal: 0, sansLinkedIn: 0, statutInconnu: 0, doublons: 0 };
  const parContact = new Map<string, string>(); // id Notion → URL normalisée
  const parUrl = new Map<string, ProspectNotion>();

  const logsParContact = new Map<string, { type: ActionNotion["type"]; jour: string }[]>();
  for (const log of entree.logs) {
    const type = typeAction(log.evenement);
    if (!type) continue;
    const l = logsParContact.get(log.contactId) ?? [];
    l.push({ type, jour: log.date });
    logsParContact.set(log.contactId, l);
  }

  for (const c of entree.contacts) {
    const statut = c.statut ?? "À contacter";
    if (statut === "À vérifier") {
      ignores.aVerifier++;
      continue;
    }
    if (statut === "Exclu") {
      ignores.exclus++;
      continue;
    }
    if (!c.signal) {
      ignores.sansSignal++;
      continue;
    }
    const regle = ETAPES[statut];
    if (!regle) {
      ignores.statutInconnu++;
      continue;
    }
    const profil = normaliserUrlLinkedIn(c.linkedin);
    if (!profil) {
      ignores.sansLinkedIn++;
      continue;
    }
    if (parUrl.has(profil.urlNormalisee)) {
      ignores.doublons++;
      continue;
    }

    const brut: Record<string, string | null> = { pageNotion: c.pageNotion, requete: c.requete, usageNotion: c.usageNotion };
    const details: Record<string, string> = {};
    for (const champ of champsDeListe(c.signal)) {
      const v = brut[champ.cle];
      if (v) details[champ.cle] = v;
    }

    const notes = [
      c.notes,
      c.entreprise?.angle ? `Angle d'approche : ${c.entreprise.angle}` : null,
      c.entreprise?.lot ? `Lot : ${c.entreprise.lot}` : null,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);

    const invitations = (logsParContact.get(c.id) ?? []).filter((l) => l.type === "invitation").map((l) => l.jour).sort();
    const { prenom, nom } = separerNom(c.nom, c.prenom);
    parContact.set(c.id, profil.urlNormalisee);
    parUrl.set(profil.urlNormalisee, {
      linkedinUrl: `https://www.${profil.urlNormalisee}`,
      urlNormalisee: profil.urlNormalisee,
      publicIdentifier: profil.publicIdentifier,
      prenom,
      nom,
      poste: c.role,
      entreprise: c.entreprise?.nom ?? null,
      listeOrigine: c.signal,
      etape: regle.etape,
      notes: notes || null,
      details,
      lien: regle.lien
        ? { type: regle.lien, date: regle.lien === "invitation_envoyee" && invitations[0] ? dateLog(invitations[0]) : null }
        : null,
    });
  }

  const actions: ActionNotion[] = [];
  for (const log of entree.logs) {
    const type = typeAction(log.evenement);
    const url = parContact.get(log.contactId);
    if (type && url) actions.push({ logId: log.id, urlNormalisee: url, type, date: dateLog(log.date) });
  }

  return { prospects: [...parUrl.values()], actions, ignores };
}
