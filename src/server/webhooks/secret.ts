import "server-only";
import { z } from "zod";

/**
 * Secret de signature des webhooks Unipile, lu par le serveur lui-même via l'API des webhooks
 * (GET /v2/webhooks/endpoints/, champ `secret`, clé API du serveur) : le tableau de bord Unipile
 * ne l'affiche pas. Il ne quitte jamais le serveur ; gardé 10 minutes en mémoire.
 */

const reponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string().max(200),
        url: z.string().max(500),
        secret: z.string().min(8).max(200),
        enabled: z.boolean().optional(),
      })
      .passthrough(),
  ),
});

const DUREE_CACHE_MS = 10 * 60 * 1000;
/** Échec gardé 1 min : de fausses requêtes ne peuvent pas déclencher un appel à Unipile à chaque fois. */
const DUREE_ECHEC_MS = 60 * 1000;
let cache: { secrets: string[]; jusqua: number } | null = null;

export function viderCacheSecretsWebhook() {
  cache = null;
}

export async function secretsWebhookUnipile(
  opts: { apiKey: string; baseUrl: string; chemin: string; maintenant?: number },
  f: typeof fetch = fetch,
): Promise<string[]> {
  const maintenant = opts.maintenant ?? Date.now();
  if (cache && cache.jusqua > maintenant) return cache.secrets;
  const echec = () => {
    cache = { secrets: [], jusqua: maintenant + DUREE_ECHEC_MS };
    return [] as string[];
  };
  let corps: unknown;
  try {
    const rep = await f(`${opts.baseUrl.replace(/\/$/, "")}/v2/webhooks/endpoints/?limit=100`, {
      headers: { "X-API-KEY": opts.apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!rep.ok) {
      // Type d'erreur Unipile (ex. api/insufficient_permissions) : diagnostic sans donnée sensible.
      const erreur = await rep.json().catch(() => null);
      const type = erreur && typeof erreur === "object" && "type" in erreur ? String((erreur as { type: unknown }).type).slice(0, 80) : "";
      console.error("[webhook] lecture du secret impossible", rep.status, type);
      return echec();
    }
    corps = await rep.json();
  } catch {
    console.error("[webhook] lecture du secret impossible (réseau)");
    return echec();
  }
  const r = reponseSchema.safeParse(corps);
  if (!r.success) {
    console.error("[webhook] réponse inattendue à la lecture du secret");
    return echec();
  }
  // Uniquement les points de terminaison de ce site (même chemin), actifs.
  const secrets = r.data.data
    .filter((w) => w.enabled !== false)
    .filter((w) => {
      try {
        return new URL(w.url).pathname.replace(/\/$/, "") === opts.chemin;
      } catch {
        return false;
      }
    })
    .map((w) => w.secret);
  cache = { secrets, jusqua: maintenant + DUREE_CACHE_MS };
  console.info("[webhook] secrets lus chez Unipile : %d point(s) de terminaison sur %d", secrets.length, r.data.data.length);
  return secrets;
}
