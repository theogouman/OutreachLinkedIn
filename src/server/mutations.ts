import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { MAXIMA, TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";
import { messageReinvitationTropTot, NOTE_INVITATION_MAX, reinvitationPossibleLe } from "@/lib/invitation";
import { reglagesRelanceSchema } from "@/lib/automatisations/catalogue";
import { identifiantVersProfil, normaliserUrlLinkedIn } from "@/lib/linkedin-url";
import { debutMois } from "@/server/queue/temps";
import { PROPRIETES_PROSPECTS, valeurListe } from "@/lib/proprietes/prospects";

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
  retrait_invitation: plafondDe("retrait_invitation"),
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

/** Mode simulé (UNIPILE_MODE=simule) : aucune action LinkedIn n'est mise en file. */
export const REFUS_NON_BRANCHE = "Unipile n'est pas branché : aucune action LinkedIn ne peut être mise en file.";

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
 * Tant qu'Unipile n'est pas branché (mode simulé), rien n'est accepté.
 */
export async function mettreMessageEnFile(pool: Pool, entree: unknown, opts: { modeSimule: boolean }) {
  const m = messageSchema.parse(entree);
  if (opts.modeSimule) throw new EnvoiRefuse(REFUS_NON_BRANCHE);

  let conv: { id: string; unipile_chat_id: string | null; prospect_id: string | null } | null = null;
  if (m.conversationId) {
    const r = await pool.query("select id, unipile_chat_id, prospect_id from public.conversations where id = $1", [m.conversationId]);
    if (!r.rowCount) throw new EnvoiRefuse("Conversation introuvable.");
    conv = r.rows[0];
  } else {
    // Conversation déjà ouverte avec ce prospect : on y écrit.
    const r = await pool.query(
      `select id, unipile_chat_id, prospect_id from public.conversations
        where prospect_id = $1 order by dernier_message_at desc nulls last limit 1`,
      [m.prospectId],
    );
    conv = r.rows[0] ?? null;
  }

  if (conv?.unipile_chat_id) {
    return insererTacheMessage(pool, conv.prospect_id, { conversation_id: conv.id, chat_id: conv.unipile_chat_id, texte: m.texte }, m.cle);
  }

  // Pas de chat Unipile (nouveau prospect, ou conversation reprise de l'archive LinkedIn) :
  // le message passe par le démarrage de conversation, qui exige une relation de 1er degré.
  const prospectId = m.prospectId ?? conv?.prospect_id ?? null;
  if (!prospectId) throw new EnvoiRefuse("Cette conversation n'est pas encore reliée à LinkedIn : réponds-y depuis LinkedIn pour l'instant.");
  const p = await pool.query("select statut_relation from public.prospects where id = $1", [prospectId]);
  if (!p.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
  if (p.rows[0].statut_relation !== "en_relation") throw new EnvoiRefuse(REFUS_PAS_EN_RELATION);
  return insererTacheMessage(pool, prospectId, { prospect_id: prospectId, texte: m.texte }, m.cle);
}


// ─── Invitations : depuis la fiche, par la file ───────────────────────────────

export const invitationSchema = z.object({
  prospectId: z.uuid(),
  /** Note facultative ; vide = invitation sans note. */
  note: z
    .string()
    .max(NOTE_INVITATION_MAX + 50)
    .optional()
    .transform((t) => t?.trim() || undefined)
    .pipe(z.string().max(NOTE_INVITATION_MAX, `Note trop longue (${NOTE_INVITATION_MAX} caractères au plus)`).optional()),
  /** Identifiant de demande, généré par le navigateur : un double clic n'invite qu'une fois. */
  cle: z.uuid(),
});

const REFUS_STATUT: Record<string, string> = {
  en_relation: "Vous êtes déjà en relation : écris-lui directement depuis l'onglet Conversation.",
  en_attente: "Une invitation est déjà en attente pour ce prospect.",
  invitation_recue: "Ce prospect t'a déjà invité : accepte son invitation sur LinkedIn.",
};

/**
 * Notes d'invitation encore possibles ce mois-ci (heure de Paris) : plafond mensuel moins les
 * invitations avec note déjà parties (même décompte que la file) et celles encore en attente.
 * `restantes` null : pas de plafond mensuel.
 */
/** Date du dernier retrait d'invitation réussi pour ce prospect (null : aucun). */
export async function dernierRetrait(c: Pool | PoolClient, prospectId: string): Promise<Date | null> {
  const r = await c.query(
    "select max(created_at) as le from public.actions where prospect_id = $1 and type = 'retrait_invitation' and resultat = 'succes'",
    [prospectId],
  );
  return r.rows[0]?.le ?? null;
}

export async function notesInvitationRestantes(c: Pool | PoolClient, maintenant = new Date()) {
  const r = await c.query(
    `select (select plafond_mois from public.quotas where type_quota = 'note_invitation') as plafond,
            (select fuseau from public.reglages where id) as fuseau`,
  );
  const plafond: number | null = r.rows[0]?.plafond ?? null;
  if (plafond === null) return { restantes: null, plafond: null };
  const depuis = debutMois(maintenant, r.rows[0].fuseau);
  const n = await c.query(
    `select (select count(*) from public.actions where type = 'invitation' and sortante and avec_note and created_at >= $1)
          + (select count(*) from public.taches where type_action = 'invitation' and avec_note and statut = 'en_attente') as n`,
    [depuis],
  );
  return { restantes: Math.max(0, plafond - Number(n.rows[0].n)), plafond };
}

/**
 * Met une invitation en file depuis la fiche : seulement pour un prospect « à inviter », une seule
 * à la fois. Sans identifiant LinkedIn connu, une lecture du profil passe avant (ordre strict par
 * prospect) ; elle peut révéler une relation existante, et l'invitation est alors abandonnée à l'envoi.
 * Le statut est revérifié par l'exécuteur juste avant l'appel. Tant qu'Unipile n'est pas branché
 * (mode simulé), rien n'est accepté.
 */
export async function mettreInvitationEnFile(pool: Pool, entree: unknown, opts: { modeSimule: boolean; maintenant?: Date }) {
  const m = invitationSchema.parse(entree);
  if (opts.modeSimule) throw new EnvoiRefuse(REFUS_NON_BRANCHE);
  const cle = `invitation:${m.cle}`;
  const c = await pool.connect();
  try {
    await c.query("begin");
    // Verrou court : deux demandes simultanées ne dépassent pas le quota de notes.
    await c.query("select pg_advisory_xact_lock(hashtext('invitations'))");
    const existante = await c.query("select id from public.taches where cle_idempotence = $1", [cle]);
    if (existante.rowCount) {
      await c.query("rollback");
      return { tacheId: existante.rows[0].id as string, nouveau: false };
    }
    const p = await c.query(
      "select statut_relation, provider_id, public_identifier, linkedin_url from public.prospects where id = $1 for update",
      [m.prospectId],
    );
    if (!p.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
    const x = p.rows[0];
    if (REFUS_STATUT[x.statut_relation]) throw new EnvoiRefuse(REFUS_STATUT[x.statut_relation]);
    const possibleLe = reinvitationPossibleLe(await dernierRetrait(c, m.prospectId), opts.maintenant ?? new Date());
    if (possibleLe) throw new EnvoiRefuse(messageReinvitationTropTot(possibleLe));
    const enFile = await c.query(
      "select 1 from public.taches where prospect_id = $1 and type_action = 'invitation' and statut in ('en_attente', 'en_cours', 'incertaine')",
      [m.prospectId],
    );
    if (enFile.rowCount) throw new EnvoiRefuse("Une invitation est déjà en file pour ce prospect.");
    if (m.note) {
      const { restantes } = await notesInvitationRestantes(c, opts.maintenant);
      if (restantes !== null && restantes <= 0) {
        throw new EnvoiRefuse("Quota de notes d'invitation du mois atteint : envoie-la sans note, ou attends le mois prochain.");
      }
    }
    const lectureEnFile = await c.query(
      "select 1 from public.taches where prospect_id = $1 and type_action = 'lecture_profil' and statut = 'en_attente'",
      [m.prospectId],
    );
    // Une lecture déjà en file passe avant l'invitation (ordre par prospect) : pas de seconde lecture.
    if (!x.provider_id && !lectureEnFile.rowCount) {
      const pid =
        (x.public_identifier && identifiantVersProfil(x.public_identifier)?.publicIdentifier) ??
        normaliserUrlLinkedIn(x.linkedin_url)?.publicIdentifier;
      if (!pid) throw new EnvoiRefuse("Adresse LinkedIn de ce prospect illisible : impossible de l'inviter.");
      await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
         values ('lecture_profil', $1, $2, $3)`,
        [m.prospectId, { public_identifier: pid }, `lecture_profil:${cle}`],
      );
    }
    const t = await c.query(
      `insert into public.taches (type_action, prospect_id, payload, avec_note, cle_idempotence)
       values ('invitation', $1, $2, $3, $4) returning id`,
      [m.prospectId, m.note ? { prospect_id: m.prospectId, note: m.note } : { prospect_id: m.prospectId }, !!m.note, cle],
    );
    await c.query("commit");
    return { tacheId: t.rows[0].id as string, nouveau: true };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ─── Propriétés modifiables depuis les vues ───────────────────────────────────

/**
 * Une entrée par propriété modifiable du catalogue (src/lib/proprietes/prospects.ts) : toute autre
 * propriété est refusée. Liste d'origine : une des listes déjà présentes, ou aucune. Étape : une des
 * étapes de la table `etapes` (ex. « Gagné » qu'aucun fait LinkedIn ne peut constater).
 */
export const proprieteSchema = z.discriminatedUnion("cle", [
  z.object({ prospectId: z.uuid(), cle: z.literal("liste"), valeur: valeurListe }),
  z.object({ prospectId: z.uuid(), cle: z.literal("etape"), valeur: z.string().min(1).max(40) }),
]);

export async function modifierPropriete(pool: Pool, entree: unknown) {
  const m = proprieteSchema.parse(entree);
  if (!PROPRIETES_PROSPECTS[m.cle].modifiable) throw new EnvoiRefuse("Cette propriété n'est pas modifiable.");
  if (m.cle === "etape") return changerEtape(pool, m.prospectId, m.valeur);
  if (m.valeur !== null) {
    const existe = await pool.query("select 1 from public.prospects where liste_origine = $1 limit 1", [m.valeur]);
    if (!existe.rowCount) throw new EnvoiRefuse("Liste inconnue : choisis une des listes existantes.");
  }
  const r = await pool.query("update public.prospects set liste_origine = $2, updated_at = now() where id = $1", [m.prospectId, m.valeur]);
  if (!r.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
}

/**
 * Étape changée à la main, notée au journal (`changement_etape`, cause « manuel », étape d'avant).
 * La synchronisation sur les faits (src/server/etapes.ts) ne recule jamais et ne touche plus une
 * étape terminale : « Gagné » posé à la main reste ; une étape non terminale peut encore avancer.
 */
async function changerEtape(pool: Pool, prospectId: string, etape: string) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const p = await c.query("select etape from public.prospects where id = $1 for update", [prospectId]);
    if (!p.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
    const connue = await c.query("select 1 from public.etapes where code = $1", [etape]);
    if (!connue.rowCount) throw new EnvoiRefuse("Étape inconnue : choisis une des étapes du pipeline.");
    const avant = p.rows[0].etape as string;
    if (avant !== etape) {
      await c.query("update public.prospects set etape = $2, updated_at = now() where id = $1", [prospectId, etape]);
      await c.query(
        `insert into public.actions (prospect_id, type, sortante, resultat, details)
         values ($1, 'changement_etape', false, 'succes', jsonb_build_object('de', $2::text, 'vers', $3::text, 'cause', 'manuel'))`,
        [prospectId, avant, etape],
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

// ─── Automatisations (page Workflow, spec 001-workflows) ──────────────────────

export const basculeAutomatisationSchema = z.object({ id: z.uuid(), active: z.boolean() }).strict();

/** Active ou met en pause. En pause, le moteur ne met plus rien en file ; les tâches déjà en file restent annulables. */
export async function basculerAutomatisation(pool: Pool, entree: unknown, maintenant = new Date()) {
  const m = basculeAutomatisationSchema.parse(entree);
  const r = await pool.query(
    `update public.automatisations
        set active = $2, active_le = case when $2 then $3 else active_le end, updated_at = $3
      where id = $1`,
    [m.id, m.active, maintenant],
  );
  if (!r.rowCount) throw new EnvoiRefuse("Automatisation introuvable.");
}

export const reglagesAutomatisationSchema = z.object({ id: z.uuid(), reglages: reglagesRelanceSchema }).strict();

/** Réglages bornés (Zod, puis contraintes SQL) ; ils s'appliquent aux décisions suivantes, pas aux tâches déjà en file. */
export async function reglerAutomatisation(pool: Pool, entree: unknown) {
  const m = reglagesAutomatisationSchema.parse(entree);
  const r = await pool.query(
    "update public.automatisations set reglages = $2, updated_at = now() where id = $1 and code = 'relance_invitations'",
    [m.id, m.reglages],
  );
  if (!r.rowCount) throw new EnvoiRefuse("Automatisation introuvable.");
}
