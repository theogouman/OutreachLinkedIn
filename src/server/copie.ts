import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { ficheProspectDepuis, filDepuis, referentielsDepuis } from "./donnees";
import { lienProfilLinkedIn } from "@/lib/linkedin-url";

/**
 * Inbox, menu d'une conversation > Copier : profil, conversation, ou les deux, en texte brut prêt à
 * coller (note, CRM, IA). Lecture seule ; appelée derrière `exigerUtilisateur()` par l'action serveur.
 */
export const copieSchema = z
  .object({ conversationId: z.uuid(), contenu: z.enum(["profil", "conversation", "tout"]) })
  .strict();

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const horodatage = (d: Date) => `${fmtJour.format(d)}, ${fmtHeure.format(d)}`;

export async function texteCopieDepuis(pool: Pool, entree: unknown): Promise<string | null> {
  const { conversationId, contenu } = copieSchema.parse(entree);
  const fil = await filDepuis(pool, { conversationId });
  if (!fil?.id) return null;

  const parties: string[] = [];
  if (contenu !== "conversation") parties.push(await profil(pool, fil));
  if (contenu !== "profil") {
    const envoyes = fil.messages.filter((m) => m.statut === "envoye");
    const lignes = envoyes.map((m) => `[${horodatage(new Date(m.envoyeAt))}] ${m.sens === "sortant" ? "Moi" : fil.nom} : ${m.texte}`);
    parties.push([`Conversation avec ${fil.nom}`, "", ...(lignes.length ? lignes : ["(aucun message)"])].join("\n"));
  }
  return parties.join("\n\n");
}

async function profil(pool: Pool, fil: NonNullable<Awaited<ReturnType<typeof filDepuis>>>): Promise<string> {
  if (!fil.prospectId) {
    // Interlocuteur hors CRM : ce que la conversation en sait.
    return [fil.nom, fil.sousTitre, fil.lienLinkedIn].filter(Boolean).join("\n");
  }
  const [fiche, refs] = await Promise.all([ficheProspectDepuis(pool, fil.prospectId), referentielsDepuis(pool)]);
  if (!fiche) return fil.nom;
  const nom = [fiche.prenom, fiche.nom].filter(Boolean).join(" ") || fil.nom;
  const poste = [fiche.poste, fiche.entreprise].filter(Boolean).join(" · ");
  const etape = refs.etapes.find((e) => e.code === fiche.etape)?.libelle ?? fiche.etape;
  const contexte = [fiche.listeOrigine ? `Liste : ${fiche.listeOrigine}` : null, `Étape : ${etape}`].filter(Boolean).join(" · ");
  return [
    nom,
    poste || null,
    fiche.profil?.titre && fiche.profil.titre !== poste ? fiche.profil.titre : null,
    fiche.profil?.localisation ?? null,
    lienProfilLinkedIn(fiche.linkedinUrl),
    contexte,
  ]
    .filter(Boolean)
    .join("\n");
}
