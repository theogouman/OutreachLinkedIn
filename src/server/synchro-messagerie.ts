import "server-only";
import type { Pool, PoolClient } from "pg";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import { rattacherConversations, texteMessage, type MessageUnipile } from "@/server/conversations";
import type { ClientLinkedIn, ConversationListee } from "@/server/unipile/types";
import type { ErreurAppel } from "@/server/queue/politique";
import { telechargerPhoto as telechargerPhotoLinkedIn, type Photo } from "@/server/unipile/photo";

/*
 * Synchronisation complète de la messagerie LinkedIn, lue chez Unipile (copie tenue par Unipile,
 * hors quotas LinkedIn ; réponses mises en cache). Deux temps, par petits lots à chaque passage
 * du worker, dans un budget de temps :
 *  1. la liste des conversations à deux, page après page : chaque conversation est rattachée au
 *     prospect (identifiant LinkedIn, sinon URL), qui reçoit identifiant et photo ; un inconnu
 *     garde son nom, son titre et sa photo sur la conversation ;
 *  2. l'historique complet de chaque conversation, une à une : les messages repris de l'archive
 *     LinkedIn sont remplacés par ceux d'Unipile, sans doublon avec ceux reçus par webhook.
 * Une conversation supprimée dans l'outil ne revient qu'avec ses messages postérieurs à la suppression.
 * Contenu tiers : texte brut, borné (texteMessage).
 */

export interface DependancesSynchro {
  client: Pick<ClientLinkedIn, "listerConversations" | "listerMessages">;
  telechargerPhoto?: (url: string) => Promise<Photo | null>;
}

export const CONVERSATIONS_PAR_PAGE = 50;
export const MESSAGES_PAR_PAGE = 100;
/** Garde-fou : messages lus au plus par conversation (les plus récents d'abord). */
export const MESSAGES_MAX = 2000;

const code = (e: ErreurAppel) => [e.status ?? "sans_reponse", e.type].filter(Boolean).join(" ").slice(0, 500);

async function noterErreur(pool: Pool, e: ErreurAppel) {
  await pool.query("update public.synchro_messagerie set derniere_erreur = $1, maj = now() where id", [code(e)]);
}

/** Un tour de synchronisation. Toujours au moins une page de conversations tant que la liste n'est pas finie. */
export async function synchroniserMessagerie(pool: Pool, deps: DependancesSynchro, budgetMs = 15_000) {
  const etat = (await pool.query("select active, offset_conversations, curseur, liste_terminee_le from public.synchro_messagerie where id")).rows[0];
  if (!etat?.active) return { conversations: 0, historiques: 0 };
  const fin = Date.now() + budgetMs;
  const telecharger = deps.telechargerPhoto ?? telechargerPhotoLinkedIn;
  let conversations = 0;
  let historiques = 0;

  // 1. Liste des conversations.
  let offset: number = etat.offset_conversations;
  let curseur: string | null = etat.curseur;
  let listeFinie = !!etat.liste_terminee_le;
  while (!listeFinie) {
    const r = await deps.client.listerConversations(CONVERSATIONS_PAR_PAGE, curseur ?? undefined, curseur ? undefined : offset);
    if (!r.ok) {
      await noterErreur(pool, r.erreur);
      return { conversations, historiques };
    }
    for (const conv of r.donnees.conversations) {
      if (!conv.aDeux) continue;
      const photo = (await photoUtile(pool, conv)) ? await telecharger(conv.interlocuteur.photoUrl!).catch(() => null) : null;
      await dansTransaction(pool, (c) => enregistrerConversation(c, conv, photo));
      conversations++;
    }
    offset += r.donnees.lus;
    curseur = r.donnees.suivant;
    listeFinie = !r.donnees.suivant && r.donnees.lus < CONVERSATIONS_PAR_PAGE;
    await pool.query(
      `update public.synchro_messagerie
          set offset_conversations = $1, curseur = $2, liste_terminee_le = case when $3 then now() end, derniere_erreur = null, maj = now()
        where id`,
      [offset, curseur, listeFinie],
    );
    if (Date.now() >= fin) return { conversations, historiques };
  }

  // 2. Historiques, une conversation à la fois.
  while (Date.now() < fin) {
    const suivante = await pool.query(
      `select id, unipile_chat_id from public.conversations
        where unipile_chat_id is not null and messages_synchro_le is null and not demo
        order by dernier_message_at desc nulls last limit 1`,
    );
    const conv = suivante.rows[0] as { id: string; unipile_chat_id: string } | undefined;
    if (!conv) break;
    const lus = await lireHistorique(deps.client, conv.unipile_chat_id);
    if (!lus.ok) {
      // Conversation introuvable chez Unipile : rien à lire, on passe à la suivante.
      if (lus.erreur.status === 404) {
        await pool.query("update public.conversations set messages_synchro_le = now() where id = $1", [conv.id]);
        continue;
      }
      await noterErreur(pool, lus.erreur);
      break;
    }
    await dansTransaction(pool, (c) => enregistrerHistorique(c, conv.id, conv.unipile_chat_id, lus.messages));
    historiques++;
  }
  return { conversations, historiques };
}

async function dansTransaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function urlDe(conv: ConversationListee): string | null {
  const id = conv.interlocuteur.publicIdentifier;
  return id ? (identifiantVersProfil(id)?.urlNormalisee ?? null) : null;
}

/** Photo à télécharger : le prospect ou la conversation hors CRM n'en a pas encore. */
async function photoUtile(pool: Pool, conv: ConversationListee): Promise<boolean> {
  if (!conv.interlocuteur.photoUrl) return false;
  const r = await pool.query(
    `select exists (select 1 from public.prospects p where not p.demo and p.photo_maj is null
                     and (p.provider_id = $1 or ($2::text is not null and p.url_normalisee = $2)))
         or not exists (select 1 from public.conversations c where c.unipile_chat_id = $3 and (c.photo_maj is not null or c.prospect_id is not null)) as utile`,
    [conv.interlocuteur.providerId, urlDe(conv), conv.chatId],
  );
  return r.rows[0].utile === true;
}

async function enregistrerConversation(c: PoolClient, conv: ConversationListee, photo: Photo | null) {
  const i = conv.interlocuteur;
  const supprimee = await c.query("select supprimee_le from public.conversations_supprimees where unipile_chat_id = $1", [conv.chatId]);
  const supprimeeLe: Date | undefined = supprimee.rows[0]?.supprimee_le;
  if (supprimeeLe && (!conv.dernierMessageA || conv.dernierMessageA <= supprimeeLe)) return;

  const url = urlDe(conv);
  const p = (
    await c.query(
      `select id, provider_id, photo_maj from public.prospects
        where not demo and (($1::text is not null and provider_id = $1) or ($2::text is not null and url_normalisee = $2))
        order by (provider_id = $1) desc nulls last limit 1`,
      [i.providerId, url],
    )
  ).rows[0] as { id: string; provider_id: string | null; photo_maj: Date | null } | undefined;

  // Prospect identifié au passage (identifiant LinkedIn et identifiant public).
  if (p && !p.provider_id && i.providerId) {
    const pris = await c.query("select 1 from public.prospects where provider_id = $1 and id <> $2", [i.providerId, p.id]);
    if (!pris.rowCount) {
      await c.query(
        "update public.prospects set provider_id = $2, public_identifier = coalesce(public_identifier, $3), updated_at = now() where id = $1",
        [p.id, i.providerId, i.publicIdentifier],
      );
      p.provider_id = i.providerId;
    }
  }

  const nonLu = conv.nonLues !== 0;
  const existante = await c.query("select id, prospect_id from public.conversations where unipile_chat_id = $1", [conv.chatId]);
  let id: string;
  if (existante.rowCount) {
    id = existante.rows[0].id;
    await c.query(
      `update public.conversations
          set prospect_id = coalesce(prospect_id, $2), rattachement_par_nom = case when prospect_id is null and $2::uuid is not null then false else rattachement_par_nom end,
              interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3), interlocuteur_nom = coalesce($4, interlocuteur_nom),
              interlocuteur_titre = coalesce($5, interlocuteur_titre), interlocuteur_public_identifier = coalesce($6, interlocuteur_public_identifier),
              dernier_message_at = greatest(coalesce(dernier_message_at, $7), $7), non_lu = $8,
              interlocuteur_complete_le = coalesce(interlocuteur_complete_le, now())
        where id = $1`,
      [id, p?.id ?? null, i.providerId, i.nom, i.titre, i.publicIdentifier, conv.dernierMessageA, nonLu],
    );
  } else {
    // Conversation reprise de l'archive pour ce prospect : reliée au chat plutôt que dupliquée.
    const archive = p
      ? await c.query(
          `update public.conversations
              set unipile_chat_id = $2, interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3), non_lu = $4,
                  dernier_message_at = greatest(coalesce(dernier_message_at, $5), $5), messages_synchro_le = null,
                  interlocuteur_complete_le = coalesce(interlocuteur_complete_le, now())
            where id = (select id from public.conversations where prospect_id = $1 and unipile_chat_id is null
                         order by dernier_message_at desc nulls last limit 1)
            returning id`,
          [p.id, conv.chatId, i.providerId, nonLu, conv.dernierMessageA],
        )
      : { rowCount: 0, rows: [] };
    if (archive.rowCount) {
      id = archive.rows[0].id;
    } else {
      const ins = await c.query(
        `insert into public.conversations
           (unipile_chat_id, prospect_id, interlocuteur_provider_id, interlocuteur_nom, interlocuteur_titre,
            interlocuteur_public_identifier, dernier_message_at, non_lu, interlocuteur_complete_le)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         returning id`,
        [conv.chatId, p?.id ?? null, i.providerId, i.nom, i.titre, i.publicIdentifier, conv.dernierMessageA, nonLu],
      );
      id = ins.rows[0].id;
    }
  }
  // Autres conversations « hors CRM » du même interlocuteur : rattachées au prospect.
  if (p?.provider_id) await rattacherConversations(c, p.id, p.provider_id);

  if (photo && p && !p.photo_maj) {
    await c.query(
      `insert into public.photos_prospects (prospect_id, contenu, type_mime, maj) values ($1, $2, $3, now())
       on conflict (prospect_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
      [p.id, photo.contenu, photo.type],
    );
    await c.query("update public.prospects set photo_maj = now() where id = $1", [p.id]);
  } else if (photo && !p) {
    await c.query(
      `insert into public.photos_conversations (conversation_id, contenu, type_mime, maj) values ($1, $2, $3, now())
       on conflict (conversation_id) do nothing`,
      [id, photo.contenu, photo.type],
    );
    await c.query("update public.conversations set photo_maj = coalesce(photo_maj, now()) where id = $1", [id]);
  }
}

/** Historique d'une conversation, page après page (curseur, sinon décalage), plafonné à MESSAGES_MAX. */
async function lireHistorique(client: DependancesSynchro["client"], chatId: string) {
  const messages: MessageUnipile[] = [];
  let curseur: string | undefined;
  let offset = 0;
  for (;;) {
    const r = await client.listerMessages(chatId, MESSAGES_PAR_PAGE, curseur, curseur ? undefined : offset);
    if (!r.ok) return { ok: false as const, erreur: r.erreur };
    messages.push(...r.donnees.messages);
    if (messages.length >= MESSAGES_MAX) break;
    if (r.donnees.suivant) curseur = r.donnees.suivant;
    else if (r.donnees.lus >= MESSAGES_PAR_PAGE) offset += r.donnees.lus;
    else break;
  }
  return { ok: true as const, messages };
}

async function enregistrerHistorique(c: PoolClient, conversationId: string, chatId: string, messages: MessageUnipile[]) {
  const supprimee = await c.query("select supprimee_le from public.conversations_supprimees where unipile_chat_id = $1", [chatId]);
  const apres: Date | null = supprimee.rows[0]?.supprimee_le ?? null;
  const lignes = messages.flatMap((m) => {
    const texte = texteMessage(m);
    const quand = new Date(m.timestamp);
    if (!texte || Number.isNaN(quand.getTime()) || (apres && quand <= apres)) return [];
    return [{ id: m.id, sens: m.is_sender ? "sortant" : "entrant", texte, quand }];
  });
  if (lignes.length) {
    // Messages repris de l'archive (sans identifiant Unipile) : remplacés par l'historique complet.
    await c.query("delete from public.messages where conversation_id = $1 and unipile_message_id is null", [conversationId]);
    await c.query(
      `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at)
       select $1, x.id, x.sens, x.texte, x.quand
         from unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[]) as x(id, sens, texte, quand)
       on conflict (unipile_message_id) do nothing`,
      [conversationId, lignes.map((l) => l.id), lignes.map((l) => l.sens), lignes.map((l) => l.texte), lignes.map((l) => l.quand)],
    );
  }
  await c.query(
    `update public.conversations
        set messages_synchro_le = now(),
            dernier_message_at = coalesce((select max(envoye_at) from public.messages where conversation_id = $1), dernier_message_at)
      where id = $1`,
    [conversationId],
  );
}
