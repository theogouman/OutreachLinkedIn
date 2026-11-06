import type { PoolClient } from "pg";
import type { TypeLien } from "@/lib/statut-relation";

export interface LienLinkedIn {
  type: TypeLien;
  urlNormalisee: string;
  providerId?: string | null;
  date?: Date | null;
}

export type SourceLien = "csv" | "sync" | "webhook";

/** Enregistre (ou rafraîchit) des liens connus. Par lots, requêtes paramétrées. */
export async function enregistrerLiens(c: PoolClient, liens: LienLinkedIn[], source: SourceLien, maintenant = new Date()) {
  const TAILLE = 1000;
  for (let i = 0; i < liens.length; i += TAILLE) {
    const lot = liens.slice(i, i + TAILLE);
    await c.query(
      `insert into public.liens_linkedin (type, url_normalisee, provider_id, date_lien, source, vu_le)
       select t, u, p, d, $5, $6
         from unnest($1::public.type_lien[], $2::text[], $3::text[], $4::timestamptz[]) as x(t, u, p, d)
       on conflict (type, url_normalisee) do update
         set provider_id = coalesce(excluded.provider_id, public.liens_linkedin.provider_id),
             date_lien = coalesce(public.liens_linkedin.date_lien, excluded.date_lien),
             vu_le = excluded.vu_le`,
      [
        lot.map((l) => l.type),
        lot.map((l) => l.urlNormalisee),
        lot.map((l) => l.providerId ?? null),
        lot.map((l) => l.date ?? null),
        source,
        maintenant,
      ],
    );
  }
}

export interface Transition {
  prospectId: string;
  avant: string;
  apres: string;
}

/**
 * Recalcule le statut de relation des prospects (tous, ou ceux visés par URL /
 * provider_id), même priorité que calculerStatutRelation() :
 * relation > invitation envoyée > invitation reçue > à inviter.
 * Renvoie les changements de statut.
 */
export async function recalculerStatuts(
  c: PoolClient,
  cible?: { urls?: string[]; providerIds?: string[] },
): Promise<Transition[]> {
  const r = await c.query(
    `with calcul as (
       select p.id, p.statut_relation as avant,
         (case
            when exists (select 1 from public.liens_linkedin l where l.type = 'relation'
                          and (l.url_normalisee = p.url_normalisee or (p.provider_id is not null and l.provider_id = p.provider_id)))
              then 'en_relation'
            when exists (select 1 from public.liens_linkedin l where l.type = 'invitation_envoyee'
                          and (l.url_normalisee = p.url_normalisee or (p.provider_id is not null and l.provider_id = p.provider_id)))
              then 'en_attente'
            when exists (select 1 from public.liens_linkedin l where l.type = 'invitation_recue'
                          and (l.url_normalisee = p.url_normalisee or (p.provider_id is not null and l.provider_id = p.provider_id)))
              then 'invitation_recue'
            else 'a_inviter'
          end)::public.statut_relation as apres
       from public.prospects p
       where $1::boolean
          or p.url_normalisee = any($2::text[])
          or p.provider_id = any($3::text[])
     )
     update public.prospects p
        set statut_relation = calcul.apres, updated_at = now()
       from calcul
      where p.id = calcul.id and calcul.avant is distinct from calcul.apres
      returning p.id, calcul.avant, calcul.apres`,
    [!cible, cible?.urls ?? [], cible?.providerIds ?? []],
  );
  return r.rows.map((row) => ({ prospectId: row.id, avant: row.avant, apres: row.apres }));
}

/**
 * Invitation acceptée (en attente → en relation, constaté par synchronisation ou
 * webhook) : passage à l'étape « Connecté » si le prospect n'est pas plus loin,
 * et événement « acceptation » au journal (non compté dans les quotas).
 */
export async function traiterAcceptations(c: PoolClient, transitions: Transition[], maintenant = new Date()) {
  const acceptes = transitions.filter((t) => t.avant === "en_attente" && t.apres === "en_relation");
  for (const t of acceptes) {
    await c.query(
      `insert into public.actions (prospect_id, type, sortante, resultat, created_at)
       values ($1, 'acceptation', false, 'succes', $2)`,
      [t.prospectId, maintenant],
    );
    const maj = await c.query(
      `update public.prospects set etape = 'connecte', updated_at = $2
        where id = $1 and etape in ('a_contacter', 'invitation_envoyee')
        returning id`,
      [t.prospectId, maintenant],
    );
    if (maj.rowCount) {
      await c.query(
        `insert into public.actions (prospect_id, type, sortante, resultat, details, created_at)
         values ($1, 'changement_etape', false, 'succes', $2, $3)`,
        [t.prospectId, { vers: "connecte", cause: "acceptation" }, maintenant],
      );
    }
  }
  return acceptes.length;
}
