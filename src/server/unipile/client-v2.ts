import { z } from "zod";
import type { ErreurAppel } from "@/server/queue/politique";
import type { ClientLinkedIn, Liste, PersonneListee, ProfilLu, Resultat } from "./types";

/**
 * Client Unipile API v2 (https://developer.unipile.com/v2.0). Schémas vérifiés
 * dans la documentation officielle le 2026-11-06. Chaque réponse est validée ;
 * une réponse inattendue est traitée comme une erreur, jamais devinée.
 */

/** Doit rester bien inférieur à la durée de réservation d'une tâche (2 min). */
export const DELAI_APPEL_MS = 25_000;

const utilisateurSchema = z.object({
  id: z.string().min(1),
  public_identifier: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  description: z.string().optional(),
});

const profilSchema = utilisateurSchema.extend({
  public_picture_url: z.string().max(2000).optional(),
  specifics: z
    .object({
      network_distance: z.enum(["SELF", "FIRST_DEGREE", "SECOND_DEGREE", "THIRD_DEGREE", "OUT_OF_NETWORK"]).optional(),
      relation_request: z.object({ type: z.enum(["sent", "received"]) }).optional(),
      relation_request_status: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

const relationsSchema = z.object({
  data: z.array(z.object({ id: z.string(), created_at: z.string().optional(), user: utilisateurSchema })),
});

const invitationsSchema = z.object({
  data: z.array(z.object({ id: z.string(), created_at: z.string().optional(), user: utilisateurSchema.optional() })),
});

/** POST /v2/{account_id}/chats/{chat_id}/messages/send → 200 { object: "MessageSent", message_id }. */
const messageEnvoyeSchema = z.object({
  object: z.literal("MessageSent"),
  message_id: z.union([z.string(), z.array(z.string()), z.null()]),
});

/**
 * POST /v2/{account_id}/inboxes/{inbox_id}/chats/send (« Start a Chat from Inbox », vérifié le
 * 2026-11-09) : corps JSON { text, users_ids } (un seul identifiant = conversation 1to1) →
 * 200 { object: "ChatStarted", chat_id, message_id }. Pour LinkedIn Classic, la boîte qui peut
 * démarrer une conversation est CLASSIC_PRIMARY (guide « LinkedIn – Send messages »).
 * Aucune option `specifics` : pas d'InMail, message normal à une relation uniquement.
 */
const conversationDemarreeSchema = z.object({
  object: z.literal("ChatStarted"),
  chat_id: z.string().min(1).max(200),
  message_id: z.union([z.string(), z.array(z.string()), z.null()]),
});
/** GET /v2/{account_id}/chats/{chat_id} → Chat ; `user_id` : l'autre participant d'une conversation à deux. */
const conversationSchema = z.object({
  object: z.literal("Chat"),
  id: z.string().min(1).max(300),
  user_id: z.string().min(1).max(300).nullish(),
  /** Nom de la conversation : pour une conversation à deux, le nom de l'interlocuteur. */
  name: z.string().max(300).nullish(),
  /** Photo de la conversation : pour une conversation à deux, celle de l'interlocuteur. */
  public_picture_url: z.string().max(2000).nullish(),
});

export const BOITE_LINKEDIN_CLASSIQUE = "CLASSIC_PRIMARY";
const PROVIDER_ID = /^[A-Za-z0-9_-]{5,200}$/;

const erreurSchema = z.object({ type: z.string().optional(), detail: z.string().optional() }).passthrough();

function date(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface OptionsClient {
  apiKey: string;
  accountId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function creerClientUnipileV2(opts: OptionsClient): ClientLinkedIn {
  if (!/^acc_[\w-]+$/.test(opts.accountId)) throw new Error("UNIPILE_ACCOUNT_ID invalide (format acc_…)");
  const base = (opts.baseUrl ?? "https://api.unipile.com").replace(/\/$/, "");
  const f = opts.fetch ?? fetch;

  async function appeler<T>(
    chemin: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    corpsJson?: Record<string, unknown>,
  ): Promise<Resultat<T>> {
    const url = new URL(`${base}/v2/${encodeURIComponent(opts.accountId)}${chemin}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let rep: Response;
    try {
      rep = await f(url, {
        method: corpsJson ? "POST" : "GET",
        body: corpsJson ? JSON.stringify(corpsJson) : undefined,
        headers: {
          "X-API-KEY": opts.apiKey,
          accept: "application/json",
          ...(corpsJson ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(DELAI_APPEL_MS),
        cache: "no-store",
      });
    } catch {
      // Réseau ou délai dépassé : on ne sait pas ce qui s'est passé.
      return { ok: false, erreur: { status: null } };
    }
    const corps: unknown = await rep.json().catch(() => null);
    if (!rep.ok) {
      const e = erreurSchema.safeParse(corps);
      const retry = Number(rep.headers.get("retry-after"));
      const erreur: ErreurAppel = {
        status: rep.status,
        type: e.success ? e.data.type : undefined,
        detail: e.success ? e.data.detail : undefined,
        retryAfterS: Number.isFinite(retry) && retry > 0 ? retry : null,
      };
      return { ok: false, erreur };
    }
    const parse = schema.safeParse(corps);
    if (!parse.success) {
      console.error("[unipile] réponse inattendue", chemin, parse.error.issues.slice(0, 3));
      return { ok: false, erreur: { status: 400, type: "reponse_inattendue" } };
    }
    return { ok: true, donnees: parse.data };
  }

  return {
    async envoyerMessage(chatId, texte) {
      const r = await appeler(`/chats/${encodeURIComponent(chatId)}/messages/send`, {}, messageEnvoyeSchema, { text: texte });
      if (!r.ok) return r;
      const id = r.donnees.message_id;
      return { ok: true, donnees: { messageId: Array.isArray(id) ? (id[0] ?? null) : id } };
    },

    async demarrerConversation(providerId, texte) {
      if (!PROVIDER_ID.test(providerId)) return { ok: false, erreur: { status: 400, type: "identifiant_invalide" } };
      const r = await appeler(`/inboxes/${BOITE_LINKEDIN_CLASSIQUE}/chats/send`, {}, conversationDemarreeSchema, {
        text: texte,
        users_ids: providerId,
      });
      if (!r.ok) return r;
      const id = r.donnees.message_id;
      return { ok: true, donnees: { chatId: r.donnees.chat_id, messageId: Array.isArray(id) ? (id[0] ?? null) : id } };
    },

    async lireConversation(chatId) {
      const r = await appeler(`/chats/${encodeURIComponent(chatId)}`, {}, conversationSchema);
      return r.ok
        ? {
            ok: true,
            donnees: { interlocuteurId: r.donnees.user_id ?? null, nom: r.donnees.name?.trim() || null, photoUrl: r.donnees.public_picture_url ?? null },
          }
        : r;
    },

    async lireProfil(identifiant) {
      // variant=linkedin_classic : accepte un identifiant public (« jane-doe ») ou un id ACo…
      // Pas de notification de visite (action séparée, jamais appelée).
      const r = await appeler(`/users/${encodeURIComponent(identifiant)}`, { variant: "linkedin_classic" }, profilSchema);
      if (!r.ok) return r;
      const p = r.donnees;
      const req = p.specifics?.relation_request;
      const enAttente = !p.specifics?.relation_request_status || p.specifics.relation_request_status === "PENDING";
      const profil: ProfilLu = {
        providerId: p.id,
        publicIdentifier: p.public_identifier ?? null,
        prenom: p.first_name ?? null,
        nom: p.last_name ?? null,
        titre: p.description ?? null,
        distance: p.specifics?.network_distance ?? null,
        invitation: req && enAttente ? (req.type === "sent" ? "envoyee" : "recue") : null,
        photoUrl: p.public_picture_url ?? null,
      };
      return { ok: true, donnees: profil };
    },

    async lireListe(liste: Liste, limite) {
      const limit = String(Math.min(Math.max(limite, 1), 100));
      if (liste === "relations") {
        const r = await appeler("/users/me/relations", { limit }, relationsSchema);
        if (!r.ok) return r;
        return {
          ok: true,
          donnees: r.donnees.data.map(
            (x): PersonneListee => ({ providerId: x.user.id, publicIdentifier: x.user.public_identifier ?? null, date: date(x.created_at) }),
          ),
        };
      }
      const type = liste === "invitations_envoyees" ? "sent" : "received";
      const r = await appeler("/users/me/relation-requests", { type, limit }, invitationsSchema);
      if (!r.ok) return r;
      return {
        ok: true,
        donnees: r.donnees.data
          .filter((x) => x.user)
          .map((x): PersonneListee => ({ providerId: x.user!.id, publicIdentifier: x.user!.public_identifier ?? null, date: date(x.created_at) })),
      };
    },
  };
}
