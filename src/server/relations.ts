import type { PoolClient } from "pg";
import type { TypeLien } from "@/lib/statut-relation";
import { creerNotification } from "@/server/notifications";
import { synchroniserEtapes } from "@/server/etapes";

export interface LienLinkedIn {
  type: TypeLien;
  urlNormalisee: string;
  providerId?: string | null;
  date?: Date | null;
  /** Invitation envoyée : son identifiant chez LinkedIn (nécessaire pour la retirer). Le plus récent l'emporte. */
  invitationId?: string | null;
}

export type SourceLien = "csv" | "sync" | "webhook" | "notion" | "outil";

/** Enregistre (ou rafraîchit) des liens connus. Par lots, requêtes paramétrées. */
export async function enregistrerLiens(c: PoolClient, liens: LienLinkedIn[], source: SourceLien, maintenant = new Date()) {
  const TAILLE = 1000;
  for (let i = 0; i < liens.length; i += TAILLE) {
    const lot = liens.slice(i, i + TAILLE);
    await c.query(
      `insert into public.liens_linkedin (type, url_normalisee, provider_id, date_lien, source, vu_le, invitation_id)
       select t, u, p, d, $5, $6, i
         from unnest($1::public.type_lien[], $2::text[], $3::text[], $4::timestamptz[], $7::text[]) as x(t, u, p, d, i)
       on conflict (type, url_normalisee) do update
         set provider_id = coalesce(excluded.provider_id, public.liens_linkedin.provider_id),
             date_lien = coalesce(public.liens_linkedin.date_lien, excluded.date_lien),
             invitation_id = coalesce(excluded.invitation_id, public.liens_linkedin.invitation_id),
             vu_le = excluded.vu_le`,
      [
        lot.map((l) => l.type),
        lot.map((l) => l.urlNormalisee),
        lot.map((l) => l.providerId ?? null),
        lot.map((l) => l.date ?? null),
        source,
        maintenant,
        lot.map((l) => (l.type === "invitation_envoyee" ? (l.invitationId ?? null) : null)),
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
 * Invitation acceptée : notification vers la fiche (onglet Conversation), une seule fois par
 * prospect. Le Push part après validation de la transaction (`pousserNotificationsEnAttente`).
 */
async function notifierAcceptation(c: PoolClient, prospectId: string) {
  const p = await c.query("select prenom, nom from public.prospects where id = $1", [prospectId]);
  if (!p.rowCount) return;
  const nom = [p.rows[0].prenom, p.rows[0].nom].filter(Boolean).join(" ").trim() || "Un prospect";
  await creerNotification(c, {
    type: "invitation_acceptee",
    niveau: "info",
    titre: `${nom} a accepté ton invitation`,
    corps: "Vous êtes en relation : tu peux lui écrire depuis sa fiche.",
    lien: `/?prospect=${prospectId}&onglet=conversation`,
    pousser: true,
  });
}

/**
 * Invitation acceptée (en attente → en relation, constaté par synchronisation ou
 * webhook) : passage à l'étape « À contacter » (code connecte) si le prospect n'est pas plus loin,
 * et événement « acceptation » au journal (non compté dans les quotas).
 */
export async function traiterAcceptations(
  c: PoolClient,
  transitions: Transition[],
  maintenant = new Date(),
  opts: { webhookRelation?: boolean } = {},
) {
  // Webhook relation.new : une nouvelle relation est toujours une invitation acceptée, même si l'outil
  // ne connaissait pas l'invitation (envoyée depuis LinkedIn). Une liste lue, elle, peut révéler
  // d'anciennes relations : seule une invitation connue (« en attente ») y vaut acceptation.
  const acceptes = transitions.filter(
    (t) => t.apres === "en_relation" && (t.avant === "en_attente" || (opts.webhookRelation && t.avant === "a_inviter")),
  );
  for (const t of acceptes) {
    const deja = await c.query("select 1 from public.actions where prospect_id = $1 and type = 'acceptation' limit 1", [t.prospectId]);
    if (!deja.rowCount) await notifierAcceptation(c, t.prospectId);
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
  // Autres changements de statut (relation ou invitation découverte par une liste, un profil) :
  // l'étape suit (« À contacter », « Invitation envoyée »), jamais de recul.
  await synchroniserEtapes(c, transitions.map((t) => t.prospectId), "relation");
  return acceptes.length;
}
