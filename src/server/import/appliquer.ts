import type { Pool, PoolClient } from "pg";
import { enregistrerLiens, recalculerStatuts } from "@/server/relations";
import type { RelationCsv } from "./connections-csv";
import type { ProspectCsv } from "./prospects-csv";
import type { ImportNotionPrepare } from "./notion";

async function transaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Relations de l'archive LinkedIn : aucun appel LinkedIn, mise à jour des statuts. */
export async function importerRelations(pool: Pool, relations: RelationCsv[]) {
  return transaction(pool, async (c) => {
    const run = await c.query("insert into public.sync_runs (type) values ('csv_relations') returning id");
    await enregistrerLiens(
      c,
      relations.map((r) => ({ type: "relation" as const, urlNormalisee: r.urlNormalisee, date: r.date })),
      "csv",
    );
    const transitions = await recalculerStatuts(c, { urls: relations.map((r) => r.urlNormalisee) });
    await c.query("update public.sync_runs set fin = now(), statut = 'succes', nb_elements = $2 where id = $1", [
      run.rows[0].id,
      relations.length,
    ]);
    return { relations: relations.length, prospectsMisAJour: transitions.length };
  });
}

/**
 * Prospects de l'export Notion. Dédoublonnage sur l'URL normalisée (un prospect
 * existant n'est pas modifié). Chaque nouveau prospect reçoit UNE tâche de lecture
 * de profil (pour son provider_id), qui partira sous le quota de lecture.
 */
export async function importerProspects(pool: Pool, prospects: ProspectCsv[], listeOrigine: string | null) {
  return transaction(pool, async (c) => {
    const run = await c.query("insert into public.sync_runs (type) values ('csv_prospects') returning id");
    const ins = await c.query(
      `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, prenom, nom, poste, entreprise, liste_origine)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
       on conflict (url_normalisee) do nothing
       returning id, public_identifier`,
      [
        prospects.map((p) => p.linkedinUrl),
        prospects.map((p) => p.urlNormalisee),
        prospects.map((p) => p.publicIdentifier),
        prospects.map((p) => p.prenom),
        prospects.map((p) => p.nom),
        prospects.map((p) => p.poste),
        prospects.map((p) => p.entreprise),
        prospects.map(() => listeOrigine),
      ],
    );
    if (ins.rowCount) {
      await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
         select 'lecture_profil', id, jsonb_build_object('public_identifier', pid), 'lecture_profil:' || id
           from unnest($1::uuid[], $2::text[]) as x(id, pid)
         on conflict (cle_idempotence) do nothing`,
        [ins.rows.map((r) => r.id), ins.rows.map((r) => r.public_identifier)],
      );
    }
    await recalculerStatuts(c, { urls: prospects.map((p) => p.urlNormalisee) });
    await c.query("update public.sync_runs set fin = now(), statut = 'succes', nb_elements = $2 where id = $1", [
      run.rows[0].id,
      ins.rowCount ?? 0,
    ]);
    return { crees: ins.rowCount ?? 0, dejaPresents: prospects.length - (ins.rowCount ?? 0), lecturesEnFile: ins.rowCount ?? 0 };
  });
}

/**
 * Import unique du CRM Notion (règles dans ./notion.ts). Un prospect déjà présent (même URL)
 * n'est pas modifié. Les logs deviennent des actions sortantes réussies, datées : elles comptent
 * dans les quotas comme LinkedIn les compte. Rejouable sans doublon (log Notion mémorisé).
 */
export async function importerNotion(pool: Pool, prep: ImportNotionPrepare) {
  const { prospects, actions } = prep;
  return transaction(pool, async (c) => {
    const run = await c.query("insert into public.sync_runs (type) values ('notion_prospects') returning id");
    const ins = await c.query(
      `insert into public.prospects
         (linkedin_url, url_normalisee, public_identifier, prenom, nom, poste, entreprise, liste_origine, etape, notes, details)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                            $9::text[], $10::text[], $11::jsonb[])
       on conflict (url_normalisee) do nothing
       returning id, public_identifier`,
      [
        prospects.map((p) => p.linkedinUrl),
        prospects.map((p) => p.urlNormalisee),
        prospects.map((p) => p.publicIdentifier),
        prospects.map((p) => p.prenom),
        prospects.map((p) => p.nom),
        prospects.map((p) => p.poste),
        prospects.map((p) => p.entreprise),
        prospects.map((p) => p.listeOrigine),
        prospects.map((p) => p.etape),
        prospects.map((p) => p.notes),
        prospects.map((p) => JSON.stringify(p.details)),
      ],
    );
    if (ins.rowCount) {
      await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
         select 'lecture_profil', id, jsonb_build_object('public_identifier', pid), 'lecture_profil:' || id
           from unnest($1::uuid[], $2::text[]) as x(id, pid)
         on conflict (cle_idempotence) do nothing`,
        [ins.rows.map((r) => r.id), ins.rows.map((r) => r.public_identifier)],
      );
    }

    await enregistrerLiens(
      c,
      prospects.flatMap((p) => (p.lien ? [{ type: p.lien.type, urlNormalisee: p.urlNormalisee, date: p.lien.date }] : [])),
      "notion",
    );

    const act = await c.query(
      `insert into public.actions (prospect_id, type, sortante, avec_note, resultat, created_at, details)
       select p.id, x.t, true, false, 'succes', x.d, jsonb_build_object('source', 'notion', 'notion_log', x.l)
         from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[]) as x(l, u, t, d)
         join public.prospects p on p.url_normalisee = x.u
        where not exists (select 1 from public.actions a where a.details ->> 'notion_log' = x.l)`,
      [actions.map((a) => a.logId), actions.map((a) => a.urlNormalisee), actions.map((a) => a.type), actions.map((a) => a.date)],
    );

    await recalculerStatuts(c, { urls: prospects.map((p) => p.urlNormalisee) });
    await c.query("update public.sync_runs set fin = now(), statut = 'succes', nb_elements = $2 where id = $1", [
      run.rows[0].id,
      ins.rowCount ?? 0,
    ]);
    return {
      crees: ins.rowCount ?? 0,
      dejaPresents: prospects.length - (ins.rowCount ?? 0),
      actions: act.rowCount ?? 0,
    };
  });
}
