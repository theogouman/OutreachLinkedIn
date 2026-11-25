import type { Pool } from "pg";
import { z } from "zod";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import { rattacherConversations } from "@/server/conversations";
import { synchroniserEtapes } from "@/server/etapes";
import { EnvoiRefuse } from "@/server/mutations";

/*
 * Actions de l'Inbox sur la personne d'une conversation :
 * - « Ne plus afficher » : la personne (son identifiant LinkedIn, à défaut la conversation) est
 *   notée dans inbox_masques ; ses conversations actuelles et futures sortent de l'Inbox et du
 *   compteur de non lus, les messages restent stockés ; le filtre « Masquées » les montre.
 * - « Ajouter au CRM » : crée la fiche à partir de ce que l'Inbox sait (nom, titre, identifiant
 *   LinkedIn, photo ; entreprise déduite du titre), y rattache ses conversations, aligne l'étape
 *   sur les messages et met en file, en priorité, une lecture de profil (identifiant, statut de
 *   relation, photo). Liste d'origine « Inbox ».
 */

/** Condition SQL « conversation masquée » (alias c = conversations, p = prospect rattaché). */
export const CONDITION_MASQUEE = `exists (
  select 1 from public.inbox_masques k
   where k.conversation_id = c.id
      or (k.provider_id is not null and k.provider_id = coalesce(c.interlocuteur_provider_id, p.provider_id))
)`;

export const LISTE_INBOX = "Inbox";
const IDENTIFIANT_LINKEDIN = /^[A-Za-z0-9_-]{3,100}$/;

async function personneDe(pool: Pool, id: unknown) {
  const conversationId = z.uuid().parse(id);
  const r = await pool.query(
    `select c.id, c.prospect_id, coalesce(c.interlocuteur_provider_id, p.provider_id) as provider_id
       from public.conversations c left join public.prospects p on p.id = c.prospect_id where c.id = $1`,
    [conversationId],
  );
  if (!r.rowCount) throw new EnvoiRefuse("Conversation introuvable.");
  const x = r.rows[0];
  return { conversationId, providerId: typeof x.provider_id === "string" && IDENTIFIANT_LINKEDIN.test(x.provider_id) ? (x.provider_id as string) : null };
}

/** « Ne plus afficher » : la personne de cette conversation disparaît de l'Inbox (récupérable). */
export async function masquerConversation(pool: Pool, id: unknown) {
  const { conversationId, providerId } = await personneDe(pool, id);
  if (providerId) await pool.query("insert into public.inbox_masques (provider_id) values ($1) on conflict (provider_id) do nothing", [providerId]);
  else await pool.query("insert into public.inbox_masques (conversation_id) values ($1) on conflict (conversation_id) do nothing", [conversationId]);
}

/** Réafficher : la personne revient dans l'Inbox. */
export async function reafficherConversation(pool: Pool, id: unknown) {
  const { conversationId, providerId } = await personneDe(pool, id);
  await pool.query("delete from public.inbox_masques where conversation_id = $1 or ($2::text is not null and provider_id = $2)", [conversationId, providerId]);
}

/** Prénom et nom depuis le nom affiché sur LinkedIn (sans emojis ni ce qui suit « , », « | » ou « ( »). */
export function prenomNom(affiche: string | null): { prenom: string | null; nom: string | null } {
  const propre = (affiche ?? "")
    .split(/[,|(]/)[0]!
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!propre) return { prenom: null, nom: null };
  const [prenom, ...reste] = propre.split(" ");
  return { prenom: prenom!.slice(0, 100), nom: reste.length ? reste.join(" ").slice(0, 100) : null };
}

/**
 * Entreprise lue dans un titre LinkedIn (« Chief People Officer at Qonto », « CEO chez Lydia »,
 * « Fondateur @Hiboo ») : le dernier « at », « chez » ou « @ », jusqu'au premier séparateur.
 * Heuristique : null si rien de clair (la lecture de profil ne donne pas l'entreprise).
 */
export function entrepriseDepuisTitre(titre: unknown): string | null {
  if (typeof titre !== "string") return null;
  const m = titre.match(/(?:^|\s)(?:at|chez|@)\s*([^|·•,;()]+)/giu);
  const brut = m?.at(-1)?.replace(/^\s*(?:at|chez|@)\s*/iu, "");
  const nom = brut?.split(/\s[-–—]\s/)[0]?.replace(/[^\p{L}\p{N}&.'’ -]/gu, "").trim();
  return nom && nom.length >= 2 && nom.length <= 100 ? nom : null;
}

/**
 * « Ajouter au CRM ». Une personne déjà présente (même adresse LinkedIn ou même identifiant) n'est
 * pas recréée : la conversation lui est rattachée (`existant`). Refusé pour une conversation déjà
 * rattachée à un prospect, ou sans identifiant LinkedIn connu.
 */
export async function ajouterAuCrm(pool: Pool, id: unknown): Promise<{ prospectId: string; existant: boolean }> {
  const conversationId = z.uuid().parse(id);
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await c.query(
      `select id, prospect_id, interlocuteur_nom, interlocuteur_titre, interlocuteur_public_identifier, interlocuteur_provider_id
         from public.conversations where id = $1 for update`,
      [conversationId],
    );
    if (!r.rowCount) throw new EnvoiRefuse("Conversation introuvable.");
    const x = r.rows[0];
    if (x.prospect_id) throw new EnvoiRefuse("Cette personne est déjà dans le CRM.");
    const providerId = typeof x.interlocuteur_provider_id === "string" && IDENTIFIANT_LINKEDIN.test(x.interlocuteur_provider_id) ? (x.interlocuteur_provider_id as string) : null;
    const profil =
      (x.interlocuteur_public_identifier && identifiantVersProfil(x.interlocuteur_public_identifier)) || (providerId && identifiantVersProfil(providerId)) || null;
    if (!profil) throw new EnvoiRefuse("Identifiant LinkedIn inconnu : impossible de créer la fiche pour l'instant.");

    const deja = await c.query("select id from public.prospects where url_normalisee = $1 or ($2::text is not null and provider_id = $2) limit 1", [
      profil.urlNormalisee,
      providerId,
    ]);
    let prospectId: string;
    const existant = !!deja.rowCount;
    if (existant) {
      prospectId = deja.rows[0].id;
      await c.query("update public.conversations set prospect_id = $1 where id = $2", [prospectId, conversationId]);
    } else {
      const { prenom, nom } = prenomNom(x.interlocuteur_nom);
      const p = await c.query(
        `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, provider_id, prenom, nom, poste, entreprise, liste_origine)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          `https://www.linkedin.com/in/${profil.publicIdentifier}`,
          profil.urlNormalisee,
          profil.publicIdentifier,
          providerId,
          prenom,
          nom,
          typeof x.interlocuteur_titre === "string" ? x.interlocuteur_titre.slice(0, 300) : null,
          entrepriseDepuisTitre(x.interlocuteur_titre),
          LISTE_INBOX,
        ],
      );
      prospectId = p.rows[0].id;
      // Photo connue de l'Inbox : reprise sur la fiche.
      await c.query(
        `insert into public.photos_prospects (prospect_id, contenu, type_mime)
         select $1, contenu, type_mime from public.photos_conversations where conversation_id = $2
         on conflict (prospect_id) do nothing`,
        [prospectId, conversationId],
      );
      await c.query("update public.prospects set photo_maj = now() where id = $1 and exists (select 1 from public.photos_prospects where prospect_id = $1)", [prospectId]);
      await c.query("update public.conversations set prospect_id = $1 where id = $2", [prospectId, conversationId]);
      if (providerId) await rattacherConversations(c, prospectId, providerId);
      // Lecture de profil en priorité : entreprise, poste, statut de relation, profil complet.
      await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
         values ('lecture_profil', $1, $2, $3) on conflict (cle_idempotence) do nothing`,
        [prospectId, { public_identifier: profil.publicIdentifier, ajout_crm: true }, `ajout_crm:${prospectId}`],
      );
    }
    await synchroniserEtapes(c, [prospectId], "synchro");
    await c.query("commit");
    return { prospectId, existant };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
