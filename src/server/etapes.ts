import type { PoolClient } from "pg";

/*
 * Étape du pipeline alignée sur les faits LinkedIn, dans un seul sens (jamais de recul, jamais
 * d'étape terminale modifiée). Étape « plancher » imposée par les faits, la plus avancée retenue :
 *   - invitation en attente                         → « Invitation envoyée » (invitation_envoyee)
 *   - en relation                                   → « À contacter » (connecte)
 *   - au moins un message envoyé par l'utilisateur  → « Premier message » (premier_message)
 *   - un message reçu après le premier envoyé       → « Répondu » (repondu)
 * Un prospect qui a écrit le premier sans réponse de notre part reste à « À contacter ».
 * Chaque changement est noté au journal (`changement_etape`, avec sa cause).
 * Les étapes sont lues dans la table `etapes` (ordre), jamais codées en nombres.
 */

export type CauseEtape = "synchro" | "message_envoye" | "relation";

export async function synchroniserEtapes(c: PoolClient, prospectIds: string[] | null, cause: CauseEtape): Promise<number> {
  if (prospectIds && prospectIds.length === 0) return 0;
  const r = await c.query(
    `with faits as (
       select p.id, p.etape as avant,
              (select e.code from public.etapes e
                where e.code = any(array[
                        case p.statut_relation when 'en_attente' then 'invitation_envoyee' when 'en_relation' then 'connecte' end,
                        case when m.premier_envoi is not null then 'premier_message' end,
                        case when m.premier_envoi is not null and m.derniere_reception > m.premier_envoi then 'repondu' end])
                order by e.ordre desc limit 1) as cible
         from public.prospects p
         left join lateral (
           select min(x.envoye_at) filter (where x.sens = 'sortant') as premier_envoi,
                  max(x.envoye_at) filter (where x.sens = 'entrant') as derniere_reception
             from public.messages x join public.conversations cv on cv.id = x.conversation_id
            where cv.prospect_id = p.id) m on true
        where $1::uuid[] is null or p.id = any($1::uuid[])
     )
     update public.prospects p set etape = f.cible, updated_at = now()
       from faits f
       join public.etapes ea on ea.code = f.avant
       join public.etapes ec on ec.code = f.cible
      where p.id = f.id and not ea.terminale and ea.ordre < ec.ordre
     returning p.id, f.cible`,
    [prospectIds],
  );
  if (!r.rowCount) return 0;
  await c.query(
    `insert into public.actions (prospect_id, type, sortante, resultat, details)
     select x.id, 'changement_etape', false, 'succes', jsonb_build_object('vers', x.cible, 'cause', $3::text)
       from unnest($1::uuid[], $2::text[]) as x(id, cible)`,
    [r.rows.map((x) => x.id), r.rows.map((x) => x.cible), cause],
  );
  return r.rowCount;
}
