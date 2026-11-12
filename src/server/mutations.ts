import type { Pool } from "pg";
import { z } from "zod";
import { MAXIMA, TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";

/**
 * Modifications demandées depuis l'interface. Toute entrée est validée ici (Zod),
 * côté serveur. Les appels passent par des Server Actions qui vérifient d'abord
 * l'utilisateur (src/app/actions).
 */

/** Une période sans maximum (null) n'a pas de plafond ; sinon entier entre 0 et le maximum. */
const borne = (max: number | null): z.ZodType<number | null> =>
  max === null ? z.null() : z.coerce.number().int().min(0).max(max);

const plafondDe = (t: TypeQuota) =>
  z.object({ jour: borne(MAXIMA[t].jour), semaine: borne(MAXIMA[t].semaine), mois: borne(MAXIMA[t].mois) });

export const plafondsSchema = z.object({
  invitation: plafondDe("invitation"),
  note_invitation: plafondDe("note_invitation"),
  lecture_profil: plafondDe("lecture_profil"),
  message: plafondDe("message"),
  lecture_liste: plafondDe("lecture_liste"),
});

export async function majPlafonds(pool: Pool, entree: unknown) {
  const v = plafondsSchema.parse(entree);
  const c = await pool.connect();
  try {
    await c.query("begin");
    for (const t of TYPES_QUOTA) {
      await c.query(
        "update public.quotas set plafond_jour = $2, plafond_semaine = $3, plafond_mois = $4, updated_at = now() where type_quota = $1",
        [t, v[t].jour, v[t].semaine, v[t].mois],
      );
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const reglagesSchema = z
  .object({
    plages: z.object({
      jours: z.array(z.number().int().min(1).max(7)).max(7).refine((j) => new Set(j).size === j.length, "jours en double"),
      creneaux: z
        .array(z.object({ debut: heure, fin: heure }).refine((c) => c.debut < c.fin, "début après la fin"))
        .min(1)
        .max(6),
    }),
    delaiMinS: z.number().int().min(60).max(3600),
    delaiMaxS: z.number().int().min(60).max(7200),
    cadence: z.object({ relance_1_jours: z.number().int().min(1).max(60), relance_2_jours: z.number().int().min(1).max(60) }),
  })
  .refine((r) => r.delaiMaxS >= r.delaiMinS, { message: "délai max < délai min", path: ["delaiMaxS"] });

export async function majReglages(pool: Pool, entree: unknown) {
  const v = reglagesSchema.parse(entree);
  await pool.query(
    `update public.reglages
        set plages = $1, delai_min_s = $2, delai_max_s = $3, cadence_relances = $4, updated_at = now()
      where id`,
    [{ jours: [...v.plages.jours].sort(), creneaux: v.plages.creneaux }, v.delaiMinS, v.delaiMaxS, v.cadence],
  );
}

export async function basculerArret(pool: Pool, arret: boolean) {
  await pool.query("update public.reglages set arret_d_urgence = $1, updated_at = now() where id", [z.boolean().parse(arret)]);
}

const idSchema = z.uuid();

/** Annule une tâche pas encore partie. Sans effet sur une tâche en cours ou terminée. */
export async function annulerTache(pool: Pool, id: unknown): Promise<boolean> {
  const r = await pool.query(
    "update public.taches set statut = 'annulee', updated_at = now() where id = $1 and statut = 'en_attente'",
    [idSchema.parse(id)],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Tâche incertaine (on ne sait pas si l'envoi est parti) : seul l'utilisateur tranche.
 * « faite » : considérée comme partie. « remettre » : renvoyée (risque de doublon
 * assumé par l'utilisateur). « abandonner » : annulée.
 */
export const decisionSchema = z.enum(["faite", "remettre", "abandonner"]);

export async function trancherIncertaine(pool: Pool, id: unknown, decision: unknown): Promise<boolean> {
  const d = decisionSchema.parse(decision);
  const statut = d === "faite" ? "faite" : d === "remettre" ? "en_attente" : "annulee";
  const r = await pool.query(
    `update public.taches set statut = $2, motif_attente = null, updated_at = now()
      where id = $1 and statut = 'incertaine'`,
    [idSchema.parse(id), statut],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Marque une conversation comme lue (seule modification possible depuis l'Inbox en lecture). */
export async function marquerLue(pool: Pool, id: unknown): Promise<boolean> {
  const r = await pool.query("update public.conversations set non_lu = false where id = $1 and non_lu", [idSchema.parse(id)]);
  return (r.rowCount ?? 0) > 0;
}

/** Remet une conversation en non lue, pour se rappeler d'y répondre. */
export async function marquerNonLue(pool: Pool, id: unknown): Promise<boolean> {
  const r = await pool.query("update public.conversations set non_lu = true where id = $1 and not non_lu", [idSchema.parse(id)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Supprime une conversation de l'outil (rien n'est supprimé sur LinkedIn) : conversation et
 * messages effacés, prospect conservé. Le chat Unipile est mémorisé (`conversations_supprimees`)
 * pour qu'une synchronisation ne fasse pas revenir les anciens messages. Refusé si un message
 * est en file ou en cours d'envoi dans cette conversation.
 */
export async function supprimerConversation(pool: Pool, id: unknown) {
  const conversationId = idSchema.parse(id);
  const c = await pool.connect();
  try {
    await c.query("begin");
    const conv = await c.query("select unipile_chat_id from public.conversations where id = $1 for update", [conversationId]);
    if (!conv.rowCount) throw new EnvoiRefuse("Conversation introuvable.");
    const enFile = await c.query(
      `select 1 from public.taches
        where type_action = 'message' and statut in ('en_attente', 'en_cours', 'incertaine')
          and payload ->> 'conversation_id' = $1::text
        limit 1`,
      [conversationId],
    );
    if (enFile.rowCount) {
      throw new EnvoiRefuse("Un message est en file pour cette conversation : annule-le dans la file d'attente ou attends son envoi.");
    }
    const chat: string | null = conv.rows[0].unipile_chat_id;
    if (chat) {
      await c.query(
        `insert into public.conversations_supprimees (unipile_chat_id) values ($1)
         on conflict (unipile_chat_id) do update set supprimee_le = now()`,
        [chat],
      );
    }
    await c.query("delete from public.conversations where id = $1", [conversationId]); // messages : en cascade
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ─── Messages : un seul chemin d'envoi, la file d'attente ─────────────────────

/** Refus explicable à l'utilisateur (message affiché tel quel). */
export class EnvoiRefuse extends Error {}

export const messageSchema = z
  .object({
    /** Conversation existante… */
    conversationId: z.uuid().optional(),
    /** …ou prospect à qui écrire (premier message s'il n'y a pas encore de conversation). */
    prospectId: z.uuid().optional(),
    texte: z
      .string()
      .transform((t) => t.trim())
      .pipe(z.string().min(1, "Message vide").max(8000, "Message trop long (8 000 caractères au plus)")),
    /** Identifiant de rédaction, généré par le navigateur : un double clic n'envoie qu'une fois. */
    cle: z.uuid(),
  })
  .refine((m) => !!m.conversationId !== !!m.prospectId, "Une conversation ou un prospect, pas les deux");

export const REFUS_PAS_EN_RELATION =
  "Pas encore en relation de 1er degré : LinkedIn bloquerait ce message. Il pourra être écrit une fois l'invitation acceptée.";

async function insererTacheMessage(pool: Pool, prospectId: string | null, payload: Record<string, string>, cleRedaction: string) {
  const cle = `message:${cleRedaction}`;
  const r = await pool.query(
    `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
     values ('message', $1, $2, $3) on conflict (cle_idempotence) do nothing returning id`,
    [prospectId, payload, cle],
  );
  if (r.rowCount) return { tacheId: r.rows[0].id as string, nouveau: true };
  const existante = await pool.query("select id from public.taches where cle_idempotence = $1", [cle]);
  return { tacheId: existante.rows[0].id as string, nouveau: false };
}

/**
 * Met un message en file d'attente. Il partira sous les quotas, dans les plages horaires et
 * après le délai entre actions, comme toute action LinkedIn (le worker ne fait jamais d'exception).
 * - Conversation existante : message dans cette conversation.
 * - Prospect sans conversation : premier message (message normal, jamais d'InMail), accepté
 *   seulement pour une relation de 1er degré ; la relation est revérifiée à l'envoi.
 * Tant qu'Unipile n'est pas branché, seules les données de démonstration sont acceptées.
 */
export async function mettreMessageEnFile(pool: Pool, entree: unknown, opts: { modeSimule: boolean }) {
  const m = messageSchema.parse(entree);
  const horsDemo = "Unipile n'est pas encore branché : seules les données de démonstration peuvent recevoir un message.";

  let conv: { id: string; unipile_chat_id: string | null; prospect_id: string | null; demo: boolean } | null = null;
  if (m.conversationId) {
    const r = await pool.query("select id, unipile_chat_id, prospect_id, demo from public.conversations where id = $1", [m.conversationId]);
    if (!r.rowCount) throw new EnvoiRefuse("Conversation introuvable.");
    conv = r.rows[0];
  } else {
    // Conversation déjà ouverte avec ce prospect : on y écrit.
    const r = await pool.query(
      `select id, unipile_chat_id, prospect_id, demo from public.conversations
        where prospect_id = $1 order by dernier_message_at desc nulls last limit 1`,
      [m.prospectId],
    );
    conv = r.rows[0] ?? null;
  }

  if (conv?.unipile_chat_id) {
    if (opts.modeSimule && !conv.demo) throw new EnvoiRefuse(horsDemo);
    return insererTacheMessage(pool, conv.prospect_id, { conversation_id: conv.id, chat_id: conv.unipile_chat_id, texte: m.texte }, m.cle);
  }

  // Pas de chat Unipile (nouveau prospect, ou conversation reprise de l'archive LinkedIn) :
  // le message passe par le démarrage de conversation, qui exige une relation de 1er degré.
  const prospectId = m.prospectId ?? conv?.prospect_id ?? null;
  if (!prospectId) throw new EnvoiRefuse("Cette conversation n'est pas encore reliée à LinkedIn : réponds-y depuis LinkedIn pour l'instant.");
  const p = await pool.query("select statut_relation, demo from public.prospects where id = $1", [prospectId]);
  if (!p.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
  if (p.rows[0].statut_relation !== "en_relation") throw new EnvoiRefuse(REFUS_PAS_EN_RELATION);
  if (opts.modeSimule && !p.rows[0].demo) throw new EnvoiRefuse(horsDemo);
  return insererTacheMessage(pool, prospectId, { prospect_id: prospectId, texte: m.texte }, m.cle);
}


// ─── Notes du prospect ────────────────────────────────────────────────────────

export const notesSchema = z.object({
  prospectId: z.uuid(),
  notes: z
    .string()
    .max(4000, "Notes trop longues (4 000 caractères au plus)")
    .transform((t) => t.trim()),
});

/** Notes libres de la fiche (vide = aucune note). */
export async function majNotes(pool: Pool, entree: unknown) {
  const n = notesSchema.parse(entree);
  const r = await pool.query("update public.prospects set notes = $2, updated_at = now() where id = $1", [n.prospectId, n.notes || null]);
  if (!r.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
}

// ─── Suppression d'un prospect ────────────────────────────────────────────────

/**
 * Supprime un prospect et ses données : fiche, notes, informations de liste, photo, conversations
 * et messages, file d'attente, journal (étapes, acceptations, réponses), liens LinkedIn connus.
 * Seules les actions envoyées à LinkedIn restent, anonymisées (sans prospect) : elles comptent
 * dans les quotas, que LinkedIn applique quoi qu'il arrive. Refusé si une action est en cours.
 */
export async function supprimerProspect(pool: Pool, id: unknown) {
  const prospectId = idSchema.parse(id);
  const c = await pool.connect();
  try {
    await c.query("begin");
    const p = await c.query("select url_normalisee, provider_id from public.prospects where id = $1 for update", [prospectId]);
    if (!p.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
    const enCours = await c.query("select 1 from public.taches where prospect_id = $1 and statut = 'en_cours' limit 1", [prospectId]);
    if (enCours.rowCount) throw new EnvoiRefuse("Une action LinkedIn est en cours pour ce prospect : réessaie dans une minute.");
    const { url_normalisee: url, provider_id: providerId } = p.rows[0];

    await c.query("delete from public.actions where prospect_id = $1 and not sortante", [prospectId]);
    await c.query("delete from public.conversations where prospect_id = $1", [prospectId]); // messages : en cascade
    await c.query("delete from public.liens_linkedin where url_normalisee = $1 or ($2::text is not null and provider_id = $2)", [url, providerId]);
    // Fiche, photo et file d'attente partent en cascade ; actions envoyées détachées (prospect_id → null).
    await c.query("delete from public.prospects where id = $1", [prospectId]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
