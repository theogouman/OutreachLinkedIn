import type { Pool } from "pg";
import { z } from "zod";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations } from "@/server/relations";
import { verifierSignatureUnipile } from "@/server/secrets";

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

export type ReponseWebhook = { status: 200 | 400 | 401 | 413; corps: { ok: boolean; doublon?: boolean } };

/**
 * Traitement d'un webhook Unipile v2. Ordre : taille → signature → format →
 * compte → idempotence → effet. Un événement déjà reçu n'a aucun nouvel effet.
 */
export async function traiterWebhookUnipile(
  pool: Pool,
  corpsBrut: string,
  signature: string | null,
  opts: { secret: string; accountId?: string; maintenantMs?: number },
): Promise<ReponseWebhook> {
  if (Buffer.byteLength(corpsBrut) > TAILLE_MAX_WEBHOOK) return { status: 413, corps: { ok: false } };
  if (!verifierSignatureUnipile(signature, corpsBrut, opts.secret, opts.maintenantMs)) return { status: 401, corps: { ok: false } };

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
    // message.new (Inbox) : phase 2. account.status.* : conservé pour l'alerte (tâche 14).

    await c.query("update public.webhook_events set traite_le = now() where id = $1", [env.data.id]);
    await c.query("commit");
    return { status: 200, corps: { ok: true } };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
