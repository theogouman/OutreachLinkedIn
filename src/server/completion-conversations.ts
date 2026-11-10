import "server-only";
import type { Pool, PoolClient } from "pg";
import { normaliser, TRANSLATE_DE, TRANSLATE_VERS } from "@/lib/recherche";
import { rattacherConversations } from "@/server/conversations";
import type { Photo } from "@/server/unipile/photo";
import type { ClientLinkedIn } from "@/server/unipile/types";

/*
 * Complétion immédiate des conversations : nom et photo de l'interlocuteur lus par « Get a Chat »
 * (lecture de la messagerie Unipile, pas une visite de profil : hors quota de lectures). Une conversation
 * hors CRM est rattachée tout de suite au prospect du même nom s'il est le seul ; la lecture de profil
 * d'identification, en file, confirme ensuite par l'URL ou corrige (executeur.ts, effetsIdentification).
 * Appelée après la réponse aux webhooks (after) et à chaque tour du worker, pour quelques conversations.
 */

export interface DependancesCompletion {
  lireConversation: ClientLinkedIn["lireConversation"];
  telechargerPhoto: (url: string) => Promise<Photo | null>;
}

/**
 * Prospect unique dont le nom complet correspond (sans casse ni accents), compatible avec l'identifiant.
 * `statut` : ne chercher que parmi les prospects de ce statut de relation (ex. invitation en attente).
 */
export async function prospectDuMemeNom(
  pool: Pool | PoolClient,
  nom: string,
  interlocuteurId: string | null,
  statut?: "en_attente",
): Promise<string | null> {
  const cle = normaliser(nom).replace(/\s+/g, " ").trim();
  if (cle.length < 3) return null;
  const r = await pool.query(
    `select id, provider_id from public.prospects
      where not demo and ($4::text is null or statut_relation::text = $4)
        and regexp_replace(lower(translate(concat_ws(' ', prenom, nom), $2, $3)), '\\s+', ' ', 'g') = $1
      limit 2`,
    [cle, TRANSLATE_DE, TRANSLATE_VERS, statut ?? null],
  );
  if (r.rowCount !== 1) return null; // aucun ou ambigu : pas de rattachement au hasard
  const p = r.rows[0];
  if (p.provider_id && interlocuteurId && p.provider_id !== interlocuteurId) return null; // un autre LinkedIn
  return p.id;
}

export async function completerConversations(pool: Pool, deps: DependancesCompletion, limite = 5) {
  const aFaire = await pool.query(
    `select id, unipile_chat_id, prospect_id, interlocuteur_nom, interlocuteur_provider_id
       from public.conversations
      where interlocuteur_complete_le is null and unipile_chat_id is not null and not demo
      order by created_at desc limit $1`,
    [limite],
  );
  let completees = 0;
  for (const conv of aFaire.rows) {
    const r = await deps.lireConversation(conv.unipile_chat_id).catch(() => null);
    const infos = r?.ok ? r.donnees : null;
    const photo = !conv.prospect_id && infos?.photoUrl ? await deps.telechargerPhoto(infos.photoUrl).catch(() => null) : null;
    if (!conv.prospect_id) {
      // Diagnostic sans donnée personnelle : présence d'une photo chez Unipile, hôte, résultat du téléchargement.
      let hote: string | null = null;
      try {
        hote = infos?.photoUrl ? new URL(infos.photoUrl).hostname : null;
      } catch {
        hote = "invalide";
      }
      console.info("[completion] photo", { lue: !!r?.ok, hote, telechargee: !!photo });
    }
    const nom = conv.interlocuteur_nom ?? infos?.nom?.slice(0, 200) ?? null;
    const interlocuteurId = conv.interlocuteur_provider_id ?? infos?.interlocuteurId ?? null;
    const prospectId = !conv.prospect_id && nom ? await prospectDuMemeNom(pool, nom, interlocuteurId) : null;

    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        `update public.conversations
            set interlocuteur_nom = coalesce(interlocuteur_nom, $2), interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3),
                interlocuteur_complete_le = now()
          where id = $1`,
        [conv.id, nom, interlocuteurId],
      );
      if (photo) {
        await c.query(
          `insert into public.photos_conversations (conversation_id, contenu, type_mime, maj) values ($1, $2, $3, now())
           on conflict (conversation_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
          [conv.id, photo.contenu, photo.type],
        );
        await c.query("update public.conversations set photo_maj = now() where id = $1", [conv.id]);
      }
      if (prospectId) {
        if (interlocuteurId) await rattacherConversations(c, prospectId, interlocuteurId); // fusion avec l'archive
        await c.query(
          "update public.conversations set prospect_id = $2, rattachement_par_nom = true where unipile_chat_id = $1 and prospect_id is null",
          [conv.unipile_chat_id, prospectId],
        );
        await c.query("update public.conversations set rattachement_par_nom = true where unipile_chat_id = $1 and prospect_id = $2", [
          conv.unipile_chat_id,
          prospectId,
        ]);
      }
      await c.query("commit");
      completees++;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      console.error("[completion] conversation non complétée", (e as Error).message);
    } finally {
      c.release();
    }
  }
  return completees;
}
