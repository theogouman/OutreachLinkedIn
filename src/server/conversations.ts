import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";

/*
 * Conversations LinkedIn reçues d'Unipile (webhooks message.*). Rattachement au prospect par son
 * identifiant LinkedIn interne (provider_id) ; une conversation reprise de l'archive (sans chat
 * Unipile) est réutilisée plutôt que dupliquée. Contenu tiers : texte brut, borné.
 */

export const messageUnipileSchema = z
  .object({
    id: z.string().min(1).max(300),
    chat_id: z.string().min(1).max(300),
    text: z.string().max(50_000).nullish(),
    timestamp: z.string().max(60),
    is_sender: z.boolean(),
    sender_id: z.string().max(300).nullish(),
    sender: z.object({ display_name: z.string().max(300).nullish() }).passthrough().nullish(),
    attachments: z.array(z.unknown()).max(100).nullish(),
    is_event: z.boolean().nullish(),
    is_hidden: z.boolean().nullish(),
    is_deleted: z.boolean().nullish(),
  })
  .passthrough();
export type MessageUnipile = z.infer<typeof messageUnipileSchema>;

/** Étapes qu'une réponse du prospect fait passer à « Répondu ». */
const AVANT_REPONSE = ["a_contacter", "invitation_envoyee", "connecte", "premier_message", "relance_1", "relance_2"];

export function texteMessage(m: MessageUnipile): string | null {
  if (m.is_event || m.is_hidden || m.is_deleted) return null;
  const t = (m.text ?? "").trim();
  if (t) return t.slice(0, 8000);
  return m.attachments?.length ? "[Pièce jointe]" : null;
}

/** Conversation existante pour ce chat, sinon rattachée (archive) ou créée. */
async function conversationPour(c: PoolClient, m: MessageUnipile, interlocuteurId: string | null) {
  const connue = await c.query("select id, prospect_id from public.conversations where unipile_chat_id = $1", [m.chat_id]);
  if (connue.rowCount) return connue.rows[0] as { id: string; prospect_id: string | null };

  const prospect = interlocuteurId
    ? await c.query("select id, demo from public.prospects where provider_id = $1 limit 1", [interlocuteurId])
    : { rows: [] as { id: string; demo: boolean }[] };
  const p = prospect.rows[0];
  if (p) {
    const reliee = await c.query(
      `update public.conversations set unipile_chat_id = $1, interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3)
        where id = (select id from public.conversations where prospect_id = $2 and unipile_chat_id is null
                     order by dernier_message_at desc nulls last limit 1)
        returning id, prospect_id`,
      [m.chat_id, p.id, interlocuteurId],
    );
    if (reliee.rowCount) return reliee.rows[0];
  }
  const nom = m.is_sender ? null : (m.sender?.display_name ?? null);
  await c.query(
    `insert into public.conversations (unipile_chat_id, prospect_id, interlocuteur_provider_id, interlocuteur_nom, demo)
     values ($1, $2, $3, $4, $5) on conflict (unipile_chat_id) do nothing`,
    [m.chat_id, p?.id ?? null, interlocuteurId, nom, p?.demo ?? false],
  );
  return (await c.query("select id, prospect_id from public.conversations where unipile_chat_id = $1", [m.chat_id])).rows[0] as {
    id: string;
    prospect_id: string | null;
  };
}

/**
 * message.new : le message rejoint le fil (sans doublon : identifiant Unipile). Reçu → conversation
 * non lue ; d'un prospect → étape « Répondu » si elle était avant, avec l'événement au journal.
 */
export async function enregistrerMessageRecu(c: PoolClient, m: MessageUnipile, interlocuteurId: string | null) {
  const texte = texteMessage(m);
  if (!texte) return { enregistre: false };
  const quand = new Date(m.timestamp);
  if (Number.isNaN(quand.getTime())) return { enregistre: false };

  const conv = await conversationPour(c, m, m.is_sender ? interlocuteurId : (m.sender_id ?? interlocuteurId));
  const ins = await c.query(
    `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at)
     values ($1, $2, $3, $4, $5) on conflict (unipile_message_id) do nothing returning id`,
    [conv.id, m.id, m.is_sender ? "sortant" : "entrant", texte, quand],
  );
  if (!ins.rowCount) return { enregistre: false };
  await c.query(
    `update public.conversations
        set dernier_message_at = greatest(coalesce(dernier_message_at, $2), $2), non_lu = non_lu or $3
      where id = $1`,
    [conv.id, quand, !m.is_sender],
  );
  if (!m.is_sender && conv.prospect_id) {
    await c.query("insert into public.actions (prospect_id, type, sortante, resultat, created_at) values ($1, 'reponse', false, 'succes', $2)", [
      conv.prospect_id,
      quand,
    ]);
    const maj = await c.query(
      "update public.prospects set etape = 'repondu', updated_at = now() where id = $1 and etape = any($2) returning id",
      [conv.prospect_id, AVANT_REPONSE],
    );
    if (maj.rowCount) {
      await c.query(
        `insert into public.actions (prospect_id, type, sortante, resultat, details, created_at)
         values ($1, 'changement_etape', false, 'succes', '{"vers": "repondu", "cause": "reponse"}', $2)`,
        [conv.prospect_id, quand],
      );
    }
  }
  return { enregistre: true, conversationId: conv.id };
}

/**
 * Identifiant LinkedIn d'un prospect enfin connu (lecture de profil) : ses conversations reçues
 * « hors CRM » lui sont rattachées ; s'il avait une conversation d'archive, elles y sont fusionnées.
 */
export async function rattacherConversations(c: PoolClient, prospectId: string, providerId: string) {
  const hors = await c.query(
    "select id, unipile_chat_id from public.conversations where prospect_id is null and interlocuteur_provider_id = $1 order by created_at",
    [providerId],
  );
  for (const h of hors.rows) {
    const archive = await c.query(
      "select id from public.conversations where prospect_id = $1 and unipile_chat_id is null order by dernier_message_at desc nulls last limit 1",
      [prospectId],
    );
    if (archive.rowCount) {
      const cible = archive.rows[0].id;
      await c.query("update public.messages set conversation_id = $2 where conversation_id = $1", [h.id, cible]);
      await c.query("delete from public.conversations where id = $1", [h.id]);
      await c.query(
        `update public.conversations c set unipile_chat_id = $2, interlocuteur_provider_id = $3,
                dernier_message_at = (select max(envoye_at) from public.messages where conversation_id = c.id),
                non_lu = c.non_lu or exists (select 1 from public.messages m where m.conversation_id = c.id and m.sens = 'entrant'
                                              and m.envoye_at > coalesce(c.dernier_message_at, '-infinity'))
          where id = $1`,
        [cible, h.unipile_chat_id, providerId],
      );
    } else {
      await c.query("update public.conversations set prospect_id = $1 where id = $2", [prospectId, h.id]);
    }
  }
  return hors.rowCount ?? 0;
}
