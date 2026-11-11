import "server-only";
import type { Pool, PoolClient } from "pg";
import webpush from "web-push";
import { z } from "zod";

/**
 * Centre de notifications et Push (PWA). Une notification est d'abord écrite en base (visible
 * dans l'app), puis poussée aux appareils abonnés. Les clés VAPID sont générées par le serveur
 * au premier besoin et gardées dans private.cles_push (jamais dans le code ni l'environnement).
 */

export type Niveau = "info" | "alerte";
export interface NouvelleNotification {
  type: string;
  niveau: Niveau;
  titre: string;
  corps?: string | null;
  /** Chemin interne (ex. « /reglages »). */
  lien?: string | null;
}

/** Sujet VAPID : adresse du site (pas d'adresse e-mail transmise aux services Push). */
const SUJET_VAPID = "https://outreach.gouman.fr";

/** Chemin interne uniquement : « /x… », jamais « //hôte » ni une adresse complète. */
export const LIEN_INTERNE = /^\/([A-Za-z0-9_?=&%.-][A-Za-z0-9/_?=&%.-]*)?$/;

export async function creerNotification(c: Pool | PoolClient, n: NouvelleNotification) {
  if (n.lien && !LIEN_INTERNE.test(n.lien)) throw new Error("Lien de notification non interne");
  const r = await c.query(
    `insert into public.notifications (type, niveau, titre, corps, lien) values ($1, $2, $3, $4, $5)
     returning id, type, niveau, titre, corps, lien, created_at`,
    [n.type, n.niveau, n.titre.slice(0, 200), n.corps?.slice(0, 1000) ?? null, n.lien ?? null],
  );
  return r.rows[0] as { id: string; titre: string; corps: string | null; lien: string | null };
}

export async function clesPush(pool: Pool): Promise<{ publique: string; privee: string }> {
  const r = await pool.query("select publique, privee from private.cles_push where id");
  if (r.rowCount) return r.rows[0];
  const cles = webpush.generateVAPIDKeys();
  await pool.query("insert into private.cles_push (publique, privee) values ($1, $2) on conflict (id) do nothing", [
    cles.publicKey,
    cles.privateKey,
  ]);
  return (await pool.query("select publique, privee from private.cles_push where id")).rows[0];
}

export const abonnementSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(200),
    auth: z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(100),
  }),
});

export async function enregistrerAbonnement(pool: Pool, entree: unknown) {
  const a = abonnementSchema.parse(entree);
  await pool.query(
    `insert into public.abonnements_push (endpoint, p256dh, auth) values ($1, $2, $3)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`,
    [a.endpoint, a.keys.p256dh, a.keys.auth],
  );
}

export async function supprimerAbonnement(pool: Pool, endpoint: unknown) {
  const e = z.url().max(1000).parse(endpoint);
  await pool.query("delete from public.abonnements_push where endpoint = $1", [e]);
}

type Envoyer = (abonnement: webpush.PushSubscription, charge: string, options: webpush.RequestOptions) => Promise<unknown>;

/** Pousse une notification à tous les appareils abonnés ; un abonnement expiré (404/410) est supprimé. */
export async function envoyerPush(
  pool: Pool,
  n: { titre: string; corps: string | null; lien: string | null },
  envoyer: Envoyer = (a, c, o) => webpush.sendNotification(a, c, o),
) {
  const abonnements = await pool.query("select endpoint, p256dh, auth from public.abonnements_push");
  if (!abonnements.rowCount) return { envoyes: 0 };
  const cles = await clesPush(pool);
  const charge = JSON.stringify({ titre: n.titre, corps: n.corps ?? "", lien: n.lien ?? "/" });
  let envoyes = 0;
  await Promise.all(
    abonnements.rows.map(async (a) => {
      try {
        await envoyer({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, {
          TTL: 24 * 3600,
          urgency: "high",
          timeout: 4000,
          vapidDetails: { subject: SUJET_VAPID, publicKey: cles.publique, privateKey: cles.privee },
        });
        envoyes++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await pool.query("delete from public.abonnements_push where endpoint = $1", [a.endpoint]);
        else console.error("[push] envoi impossible", code ?? "réseau");
      }
    }),
  );
  return { envoyes };
}

/** Écrit la notification puis la pousse (le Push ne bloque jamais l'écriture). */
export async function notifier(pool: Pool, n: NouvelleNotification, envoyer?: Envoyer) {
  const cree = await creerNotification(pool, n);
  await envoyerPush(pool, cree, envoyer).catch((e) => console.error("[push]", (e as Error).message));
  return cree;
}

export interface NotificationAffichee {
  id: string;
  type: string;
  niveau: Niveau;
  titre: string;
  corps: string | null;
  lien: string | null;
  lue: boolean;
  creeeLe: Date;
}

export async function notificationsDepuis(pool: Pool): Promise<{ liste: NotificationAffichee[]; nonLues: number }> {
  const r = await pool.query(
    `select id, type, niveau, titre, corps, lien, lue, created_at,
            (select count(*) from public.notifications where not lue)::int as non_lues
       from public.notifications order by created_at desc limit 30`,
  );
  return {
    liste: r.rows.map((x) => ({ id: x.id, type: x.type, niveau: x.niveau, titre: x.titre, corps: x.corps, lien: x.lien, lue: x.lue, creeeLe: x.created_at })),
    nonLues: r.rows[0]?.non_lues ?? 0,
  };
}

export async function marquerNotificationsLues(pool: Pool) {
  await pool.query("update public.notifications set lue = true where not lue");
}
