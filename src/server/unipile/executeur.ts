import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import type { TypeLien } from "@/lib/statut-relation";
import type { AppliquerEffets, ExecuteurLinkedIn, ResultatAppel } from "@/server/queue/worker";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations, type LienLinkedIn } from "@/server/relations";
import type { ClientLinkedIn, Liste, PersonneListee, ProfilLu } from "./types";
import { telechargerPhoto as telechargerPhotoLinkedIn, type Photo } from "./photo";
import { rattacherConversations } from "@/server/conversations";

const listeSchema = z.enum(["relations", "invitations_envoyees", "invitations_recues"]);
const payloadLectureProfil = z.object({ public_identifier: z.string().min(3).max(100) });
const payloadMessage = z.object({
  conversation_id: z.uuid(),
  chat_id: z.string().min(1).max(200),
  texte: z.string().min(1).max(8000),
});
/** Premier message à un prospect : la conversation est résolue (ou démarrée) au moment de l'envoi. */
const payloadPremierMessage = z.object({
  prospect_id: z.uuid(),
  texte: z.string().min(1).max(8000),
});
const payloadLectureListe = z.object({ liste: listeSchema, limite: z.number().int().min(1).max(100).default(50) });

type Donnees =
  | { genre: "profil"; profil: ProfilLu; photo: Photo | null }
  | { genre: "liste"; liste: Liste; personnes: PersonneListee[] }
  | { genre: "message"; conversationId: string; texte: string; messageId: string | null }
  | { genre: "conversation"; prospectId: string; chatId: string; providerId: string; texte: string; messageId: string | null };

/** État du destinataire d'un premier message, relu juste avant l'appel LinkedIn. */
export interface Destinataire {
  statutRelation: string;
  providerId: string | null;
  conversationId: string | null;
  chatId: string | null;
}
export type LireDestinataire = (prospectId: string) => Promise<Destinataire | null>;

export function lireDestinataireDepuis(pool: Pool): LireDestinataire {
  return async (prospectId) => {
    const r = await pool.query(
      `select p.statut_relation, p.provider_id, c.id as conversation_id, c.unipile_chat_id
         from public.prospects p
         left join lateral (select id, unipile_chat_id from public.conversations
                             where prospect_id = p.id order by dernier_message_at desc nulls last limit 1) c on true
        where p.id = $1`,
      [prospectId],
    );
    if (!r.rowCount) return null;
    const x = r.rows[0];
    return { statutRelation: x.statut_relation, providerId: x.provider_id, conversationId: x.conversation_id, chatId: x.unipile_chat_id };
  };
}

const invalide = (type: string): ResultatAppel => ({ ok: false, erreur: { status: 400, type } });

/**
 * Traduit une tâche de la file en appel LinkedIn : lectures, messages, et premier message
 * (démarrage de conversation) à une relation de 1er degré, revérifiée juste avant l'appel.
 */
export function creerExecuteur(
  client: ClientLinkedIn,
  deps: { lireDestinataire?: LireDestinataire; telechargerPhoto?: (url: string) => Promise<Photo | null> } = {},
): ExecuteurLinkedIn {
  const telecharger = deps.telechargerPhoto ?? telechargerPhotoLinkedIn;
  return {
    async executer(tache) {
      if (tache.typeAction === "lecture_profil") {
        const p = payloadLectureProfil.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireProfil(p.data.public_identifier);
        if (!r.ok) return r;
        // Photo prise au passage (aucun appel LinkedIn en plus : CDN public) ; échec = pas de photo.
        const photo = r.donnees.photoUrl ? await telecharger(r.donnees.photoUrl).catch(() => null) : null;
        return { ok: true, donnees: { genre: "profil", profil: r.donnees, photo } satisfies Donnees };
      }
      if (tache.typeAction === "lecture_liste") {
        const p = payloadLectureListe.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireListe(p.data.liste, p.data.limite);
        return r.ok ? { ok: true, donnees: { genre: "liste", liste: p.data.liste, personnes: r.donnees } satisfies Donnees } : r;
      }
      if (tache.typeAction === "message" && payloadPremierMessage.safeParse(tache.payload).success) {
        const p = payloadPremierMessage.parse(tache.payload);
        if (!deps.lireDestinataire) return invalide("non_disponible");
        const d = await deps.lireDestinataire(p.prospect_id);
        if (!d) return invalide("prospect_introuvable");
        if (d.conversationId && d.chatId) {
          // Une conversation existe désormais (réponse reçue, ou premier message déjà parti) : on y écrit.
          const r = await client.envoyerMessage(d.chatId, p.texte);
          return r.ok
            ? { ok: true, donnees: { genre: "message", conversationId: d.conversationId, texte: p.texte, messageId: r.donnees.messageId } satisfies Donnees }
            : r;
        }
        // Message normal uniquement : sans relation de 1er degré, LinkedIn le bloquerait.
        if (d.statutRelation !== "en_relation") return invalide("pas_en_relation");
        if (!d.providerId) return invalide("identifiant_linkedin_inconnu");
        const r = await client.demarrerConversation(d.providerId, p.texte);
        return r.ok
          ? {
              ok: true,
              donnees: {
                genre: "conversation",
                prospectId: p.prospect_id,
                chatId: r.donnees.chatId,
                providerId: d.providerId,
                texte: p.texte,
                messageId: r.donnees.messageId,
              } satisfies Donnees,
            }
          : r;
      }
      if (tache.typeAction === "message") {
        const p = payloadMessage.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.envoyerMessage(p.data.chat_id, p.data.texte);
        return r.ok
          ? { ok: true, donnees: { genre: "message", conversationId: p.data.conversation_id, texte: p.data.texte, messageId: r.donnees.messageId } satisfies Donnees }
          : r;
      }
      // Invitations : pas encore disponibles.
      return invalide("non_disponible");
    },
  };
}

const TYPE_LIEN: Record<Liste, TypeLien> = {
  relations: "relation",
  invitations_envoyees: "invitation_envoyee",
  invitations_recues: "invitation_recue",
};

function urlDe(p: { publicIdentifier: string | null; providerId: string }): string {
  // Sans identifiant public, on garde le provider_id : le rapprochement se fait alors par lui.
  return (p.publicIdentifier && identifiantVersProfil(p.publicIdentifier)?.urlNormalisee) || `provider:${p.providerId}`;
}

async function effetsProfil(c: PoolClient, prospectId: string | null, tacheId: string, profil: ProfilLu, photo: Photo | null) {
  if (!prospectId) return;
  const prospect = await c.query("select url_normalisee from public.prospects where id = $1", [prospectId]);
  if (!prospect.rowCount) return; // supprimé entre-temps
  const url: string = prospect.rows[0].url_normalisee;

  if (photo) {
    await c.query(
      `insert into public.photos_prospects (prospect_id, contenu, type_mime, maj) values ($1, $2, $3, now())
       on conflict (prospect_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
      [prospectId, photo.contenu, photo.type],
    );
    await c.query("update public.prospects set photo_maj = now() where id = $1", [prospectId]);
  }

  const doublon = await c.query("select id from public.prospects where provider_id = $1 and id <> $2", [profil.providerId, prospectId]);
  if (doublon.rowCount) {
    // Deux fiches pour la même personne (URL différentes) : on ne fusionne pas en silence.
    await c.query("update public.taches set derniere_erreur = $2 where id = $1", [tacheId, `doublon de ${doublon.rows[0].id}`]);
  } else {
    await c.query(
      "update public.prospects set provider_id = $2, public_identifier = coalesce($3, public_identifier), updated_at = now() where id = $1",
      [prospectId, profil.providerId, profil.publicIdentifier],
    );
    // Conversations reçues avant que le prospect soit identifié : rattachées maintenant.
    await rattacherConversations(c, prospectId, profil.providerId);
  }

  const liens: LienLinkedIn[] = [];
  if (profil.distance === "FIRST_DEGREE") liens.push({ type: "relation", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "envoyee") liens.push({ type: "invitation_envoyee", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "recue") liens.push({ type: "invitation_recue", urlNormalisee: url, providerId: profil.providerId });
  await enregistrerLiens(c, liens, "sync");
  await traiterAcceptations(c, await recalculerStatuts(c, { urls: [url], providerIds: [profil.providerId] }));
}

async function effetsListe(c: PoolClient, liste: Liste, personnes: PersonneListee[]) {
  const liens = personnes.map((p) => ({ type: TYPE_LIEN[liste], urlNormalisee: urlDe(p), providerId: p.providerId, date: p.date }));
  await enregistrerLiens(c, liens, "sync");
  const transitions = await recalculerStatuts(c, { urls: liens.map((l) => l.urlNormalisee), providerIds: liens.map((l) => l.providerId) });
  await traiterAcceptations(c, transitions);
  await c.query(
    "insert into public.sync_runs (type, fin, nb_elements, statut) values ($1, now(), $2, 'succes')",
    [liste, personnes.length],
  );
}

/** Message parti : il rejoint le fil de la conversation, à l'heure de l'envoi. */
async function effetsMessage(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "message" }>) {
  const a = await c.query("select created_at from public.actions where tache_id = $1 order by created_at desc limit 1", [tacheId]);
  const quand: Date = a.rows[0]?.created_at ?? new Date();
  await c.query(
    `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at)
     values ($1, $2, 'sortant', $3, $4) on conflict (unipile_message_id) do nothing`,
    [d.conversationId, d.messageId, d.texte, quand],
  );
  await c.query(
    "update public.conversations set dernier_message_at = greatest(coalesce(dernier_message_at, $2), $2) where id = $1",
    [d.conversationId, quand],
  );
}

/**
 * Conversation démarrée : rattachée au prospect avec le premier message. Une conversation reprise
 * de l'archive LinkedIn (sans chat Unipile) est reliée à ce chat plutôt que dupliquée.
 */
async function effetsConversation(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "conversation" }>) {
  const reliee = await c.query(
    `update public.conversations set unipile_chat_id = $1, interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3)
      where id = (select id from public.conversations where prospect_id = $2 and unipile_chat_id is null
                   order by dernier_message_at desc nulls last limit 1)
        and not exists (select 1 from public.conversations where unipile_chat_id = $1)
      returning id`,
    [d.chatId, d.prospectId, d.providerId],
  );
  if (reliee.rowCount) {
    await effetsMessage(c, tacheId, { genre: "message", conversationId: reliee.rows[0].id, texte: d.texte, messageId: d.messageId });
    return;
  }
  const conv = await c.query(
    `insert into public.conversations (unipile_chat_id, prospect_id, interlocuteur_provider_id, demo)
     select $1, p.id, $3, coalesce(p.demo, false)
       from (select 1) x left join public.prospects p on p.id = $2
     on conflict (unipile_chat_id) do update
       set prospect_id = coalesce(public.conversations.prospect_id, excluded.prospect_id)
     returning id`,
    [d.chatId, d.prospectId, d.providerId],
  );
  await effetsMessage(c, tacheId, { genre: "message", conversationId: conv.rows[0].id, texte: d.texte, messageId: d.messageId });
}

export const appliquerEffetsUnipile: AppliquerEffets = async (c, tache, donnees) => {
  const d = donnees as Donnees;
  if (d.genre === "message") return effetsMessage(c, tache.id, d);
  if (d.genre === "conversation") return effetsConversation(c, tache.id, d);
  if (d.genre === "profil") await effetsProfil(c, tache.prospectId, tache.id, d.profil, d.photo);
  else if (d.genre === "liste") await effetsListe(c, d.liste, d.personnes);
};
