import type { Pool } from "pg";
import { z } from "zod";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations } from "@/server/relations";
import { verifierSignatureUnipile } from "@/server/secrets";
import { accuseLectureSchema, enregistrerAccuseLecture, enregistrerMessageRecu, messageUnipileSchema } from "@/server/conversations";
import { creerNotification, envoyerPush } from "@/server/notifications";

export const TAILLE_MAX_WEBHOOK = 1024 * 1024;

const enveloppeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  account_id: z.string().max(200).optional(),
  payload: z.unknown(),
});

const relationSchema = z.object({
  user: z.object({ id: z.string().min(1).max(200), public_identifier: z.string().max(200).optional() }),
  created_at: z.string().optional(),
});

const messageModifieSchema = z.object({ id: z.string().min(1).max(300), text: z.string().max(50_000).nullish() }).passthrough();
const messageSupprimeSchema = z.object({ id: z.string().min(1).max(300) }).passthrough();

/** Dépendances externes, remplaçables en test. */
export interface DependancesWebhook {
  /** Interlocuteur d'un chat inconnu dont le message vient du compte lui-même (Get a Chat). */
  lireInterlocuteur?: (chatId: string) => Promise<string | null>;
  envoyerPush?: Parameters<typeof envoyerPush>[2];
}

/** Réponse attendue en moins de 5 s : la lecture d'interlocuteur est bornée à 3 s. */
async function avecDelai<T>(p: Promise<T>, ms: number, defaut: T): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<T>((r) => (minuteur = setTimeout(() => r(defaut), ms)));
  try {
    return await Promise.race([p.catch(() => defaut), delai]);
  } finally {
    clearTimeout(minuteur);
  }
}

export type ReponseWebhook = { status: 200 | 400 | 401 | 413; corps: { ok: boolean; doublon?: boolean } };

/**
 * Traitement d'un webhook Unipile v2. Ordre : taille → signature → format →
 * compte → idempotence → effet. Un événement déjà reçu n'a aucun nouvel effet.
 */
export async function traiterWebhookUnipile(
  pool: Pool,
  corpsBrut: string,
  signature: string | null,
  opts: {
    /** Secret configuré (variable d'environnement), s'il existe. */
    secret?: string;
    /** Secrets lus chez Unipile, essayés si le premier manque ou ne correspond pas. */
    secretsSecours?: () => Promise<string[]>;
    accountId?: string;
    maintenantMs?: number;
    deps?: DependancesWebhook;
  },
): Promise<ReponseWebhook> {
  if (Buffer.byteLength(corpsBrut) > TAILLE_MAX_WEBHOOK) return { status: 413, corps: { ok: false } };
  let signe = !!opts.secret && verifierSignatureUnipile(signature, corpsBrut, opts.secret, opts.maintenantMs);
  if (!signe && signature && opts.secretsSecours) {
    for (const s of await opts.secretsSecours()) {
      if (verifierSignatureUnipile(signature, corpsBrut, s, opts.maintenantMs)) {
        signe = true;
        break;
      }
    }
  }
  if (!signe) return { status: 401, corps: { ok: false } };

  let json: unknown;
  try {
    json = JSON.parse(corpsBrut);
  } catch {
    return { status: 400, corps: { ok: false } };
  }
  const env = enveloppeSchema.safeParse(json);
  if (!env.success) return { status: 400, corps: { ok: false } };
  // Événement d'un autre compte Unipile : ignoré (mais accusé, pour éviter les relances).
  if (opts.accountId && env.data.account_id !== opts.accountId) return { status: 200, corps: { ok: true } };

  // message.new d'un chat inconnu, envoyé depuis le compte (téléphone…) : qui est l'interlocuteur ?
  let messageRecu: ReturnType<typeof messageUnipileSchema.safeParse> | null = null;
  let interlocuteur: string | null = null;
  if (env.data.type === "message.new") {
    messageRecu = messageUnipileSchema.safeParse(env.data.payload);
    if (messageRecu.success && messageRecu.data.is_sender && opts.deps?.lireInterlocuteur) {
      const connu = await pool.query("select 1 from public.conversations where unipile_chat_id = $1", [messageRecu.data.chat_id]);
      if (!connu.rowCount) interlocuteur = await avecDelai(opts.deps.lireInterlocuteur(messageRecu.data.chat_id), 3000, null);
    }
  }

  let alerte: { titre: string; corps: string | null; lien: string | null } | null = null;
  const c = await pool.connect();
  try {
    await c.query("begin");
    const ins = await c.query(
      "insert into public.webhook_events (id, type) values ($1, $2) on conflict (id) do nothing returning id",
      [env.data.id, env.data.type],
    );
    if (!ins.rowCount) {
      await c.query("rollback");
      return { status: 200, corps: { ok: true, doublon: true } };
    }

    if (env.data.type === "relation.new") {
      const rel = relationSchema.safeParse(env.data.payload);
      if (rel.success) {
        const { id, public_identifier } = rel.data.user;
        const url = (public_identifier && identifiantVersProfil(public_identifier)?.urlNormalisee) || `provider:${id}`;
        const d = rel.data.created_at ? new Date(rel.data.created_at) : null;
        await enregistrerLiens(c, [{ type: "relation", urlNormalisee: url, providerId: id, date: d && !Number.isNaN(d.getTime()) ? d : null }], "webhook");
        await traiterAcceptations(c, await recalculerStatuts(c, { urls: [url], providerIds: [id] }));
      }
    }
    if (messageRecu?.success) await enregistrerMessageRecu(c, messageRecu.data, interlocuteur);

    if (env.data.type === "message.update") {
      const m = messageModifieSchema.safeParse(env.data.payload);
      const texte = m.success ? (m.data.text ?? "").trim().slice(0, 8000) : "";
      if (m.success && texte) await c.query("update public.messages set texte = $2 where unipile_message_id = $1", [m.data.id, texte]);
    }
    if (env.data.type === "message.delete") {
      const m = messageSupprimeSchema.safeParse(env.data.payload);
      if (m.success) await c.query("delete from public.messages where unipile_message_id = $1", [m.data.id]);
    }

    if (env.data.type === "message.receipt.read") {
      const a = accuseLectureSchema.safeParse(env.data.payload);
      if (a.success) await enregistrerAccuseLecture(c, a.data);
    }

    if (env.data.type === "account.status.disconnected") {
      alerte = await creerNotification(c, {
        type: "compte_deconnecte",
        niveau: "alerte",
        titre: "Compte LinkedIn déconnecté",
        corps: "Unipile ne peut plus agir sur ton compte : reconnecte-le dans le tableau de bord Unipile. La file est en attente d'ici là.",
        lien: "/reglages",
      });
    }
    // Accusés de réception, réactions, nouveaux abonnés : reçus sans effet pour l'instant.

    await c.query("update public.webhook_events set traite_le = now() where id = $1", [env.data.id]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  // Après validation : le Push ne doit jamais faire échouer l'enregistrement.
  if (alerte) await envoyerPush(pool, alerte, opts.deps?.envoyerPush).catch((e) => console.error("[push]", (e as Error).message));
  return { status: 200, corps: { ok: true } };
}
