import type { Pool } from "pg";
import { z } from "zod";
import { adressePhoto } from "@/lib/photos";
import { EnvoiRefuse } from "@/server/mutations";

/*
 * Personnes associées : un groupe (groupes_personnes) réunit des prospects liés, par exemple les
 * dirigeants d'une même entreprise. Un prospect appartient à un groupe au plus ; associer deux
 * personnes de groupes différents fusionne les groupes ; un groupe réduit à une personne disparaît.
 * Suggestions : les autres prospects de la même entreprise (nom d'entreprise du profil enrichi, à
 * défaut celui de la fiche), hors libellés génériques (« Self-employed », « Freelance »…).
 */

/** Entreprises qui n'en sont pas : jamais de regroupement ni de suggestion sur ces noms. */
export const ENTREPRISES_GENERIQUES = [
  "self-employed",
  "self employed",
  "freelance",
  "freelancer",
  "indépendant",
  "independant",
  "indépendante",
  "auto-entrepreneur",
  "autoentrepreneur",
  "consultant",
  "consultante",
  "stealth",
  "stealth mode",
  "confidentiel",
  "confidential",
  "en recherche",
  "retraité",
];

/** Clé d'entreprise d'un prospect (alias p = prospects, pl = profils_linkedin), en minuscules. */
const CLE_ENTREPRISE = "lower(btrim(coalesce(nullif(btrim(pl.entreprise->>'nom'), ''), p.entreprise)))";

export interface PersonneAssociee {
  id: string;
  nom: string;
  poste: string | null;
  photo: string | null;
}

const ligne = (x: { id: string; nom: string; poste: string | null; photo_maj: Date | null }): PersonneAssociee => ({
  id: x.id,
  nom: x.nom,
  poste: x.poste,
  photo: adressePhoto(x.id, x.photo_maj),
});

export async function personnesAssocieesDepuis(pool: Pool, prospectId: string): Promise<{ associes: PersonneAssociee[]; suggestions: PersonneAssociee[] }> {
  const r = await pool.query(
    `with moi as (
       select p.id, p.groupe_id, ${CLE_ENTREPRISE} as cle
         from public.prospects p left join public.profils_linkedin pl on pl.prospect_id = p.id where p.id = $1
     )
     select p.id, coalesce(nullif(concat_ws(' ', p.prenom, p.nom), ''), 'Sans nom') as nom, p.poste, p.photo_maj,
            (p.groupe_id is not null and p.groupe_id = moi.groupe_id) as associe
       from public.prospects p
       left join public.profils_linkedin pl on pl.prospect_id = p.id, moi
      where p.id <> moi.id
        and ((moi.groupe_id is not null and p.groupe_id = moi.groupe_id)
             or (moi.cle is not null and moi.cle <> '' and not (moi.cle = any($2::text[])) and ${CLE_ENTREPRISE} = moi.cle))
      order by associe desc, coalesce(p.nom, ''), coalesce(p.prenom, ''), p.id
      limit 40`,
    [prospectId, ENTREPRISES_GENERIQUES],
  );
  return {
    associes: r.rows.filter((x) => x.associe).map(ligne),
    suggestions: r.rows.filter((x) => !x.associe).slice(0, 8).map(ligne),
  };
}

export const associationSchema = z
  .object({ prospectId: z.uuid(), autreId: z.uuid() })
  .strict()
  .refine((a) => a.prospectId !== a.autreId, "Une personne ne s'associe pas à elle-même.");

/** Associe deux prospects (crée, complète ou fusionne les groupes). */
export async function associerProspects(pool: Pool, entree: unknown) {
  const a = associationSchema.parse(entree);
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await c.query("select id, groupe_id from public.prospects where id = any($1::uuid[]) order by id for update", [[a.prospectId, a.autreId]]);
    if (r.rowCount !== 2) throw new EnvoiRefuse("Prospect introuvable.");
    const g = Object.fromEntries(r.rows.map((x) => [x.id, x.groupe_id as string | null]));
    const [ga, gb] = [g[a.prospectId] ?? null, g[a.autreId] ?? null];
    if (ga && ga === gb) {
      await c.query("commit");
      return;
    }
    if (!ga && !gb) {
      const n = await c.query("insert into public.groupes_personnes default values returning id");
      await c.query("update public.prospects set groupe_id = $1 where id = any($2::uuid[])", [n.rows[0].id, [a.prospectId, a.autreId]]);
    } else if (ga && !gb) {
      await c.query("update public.prospects set groupe_id = $1 where id = $2", [ga, a.autreId]);
    } else if (!ga && gb) {
      await c.query("update public.prospects set groupe_id = $1 where id = $2", [gb, a.prospectId]);
    } else {
      // Deux groupes : fusion dans celui de la fiche ouverte.
      await c.query("update public.prospects set groupe_id = $1 where groupe_id = $2", [ga, gb]);
      await c.query("delete from public.groupes_personnes where id = $1", [gb]);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Retire un prospect de son groupe ; un groupe réduit à une personne disparaît. */
export async function dissocierProspect(pool: Pool, id: unknown) {
  const prospectId = z.uuid().parse(id);
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await c.query("select groupe_id from public.prospects where id = $1 for update", [prospectId]);
    if (!r.rowCount) throw new EnvoiRefuse("Prospect introuvable.");
    const groupe = r.rows[0].groupe_id as string | null;
    if (groupe) {
      await c.query("update public.prospects set groupe_id = null where id = $1", [prospectId]);
      const reste = await c.query("select count(*)::int as n from public.prospects where groupe_id = $1", [groupe]);
      if (reste.rows[0].n < 2) await c.query("delete from public.groupes_personnes where id = $1", [groupe]);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Regroupement initial par entreprise (une fois, en production, par Claude ; testé ici) : un groupe
 * par entreprise d'au moins deux prospects encore sans groupe, hors libellés génériques. Renvoie
 * le nombre de groupes créés. $1 : ENTREPRISES_GENERIQUES.
 */
export const SQL_REGROUPER_PAR_ENTREPRISE = `
with cles as (
  select p.id, ${CLE_ENTREPRISE} as cle
    from public.prospects p left join public.profils_linkedin pl on pl.prospect_id = p.id
   where p.groupe_id is null
), entreprises as (
  select cle from cles where cle is not null and cle <> '' and not (cle = any($1::text[])) group by cle having count(*) >= 2
), groupes as (
  insert into public.groupes_personnes (id) select gen_random_uuid() from entreprises returning id
), numerotes as (
  select cle, row_number() over (order by cle) as n from entreprises
), ids as (
  select id, row_number() over (order by id) as n from groupes
), affectation as (
  update public.prospects p set groupe_id = ids.id
    from cles join numerotes on numerotes.cle = cles.cle join ids on ids.n = numerotes.n
   where p.id = cles.id
  returning p.groupe_id
)
select count(distinct groupe_id)::int as groupes, count(*)::int as personnes from affectation`;

export async function regrouperParEntreprise(pool: Pool): Promise<{ groupes: number; personnes: number }> {
  const r = await pool.query(SQL_REGROUPER_PAR_ENTREPRISE, [ENTREPRISES_GENERIQUES]);
  return r.rows[0];
}
