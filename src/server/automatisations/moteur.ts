/**
 * Moteur des automatisations (spec 001-workflows) : un passage à chaque tour du worker, avant le tour
 * de file, en mode réel seulement. Il ne parle jamais à LinkedIn : il décide (règles pures de
 * `relance-invitations.ts`) et met en file ; la file exécute sous les quotas, plages, gels et arrêt.
 *
 * Garanties :
 * - un seul passage à la fois (verrou consultatif propre) ;
 * - rien si l'automatisation est en pause ou si l'arrêt d'urgence est actif ;
 * - jamais deux fois : clé d'idempotence déterministe par prospect, cycle, action et échéance ;
 * - étalement : au plus `plafond_jour` tâches mises en file par jour (heure de Paris) ; au-delà, la
 *   décision attend le passage suivant, sans changer d'état ;
 * - une invitation ou un retrait déjà en file pour ce prospect (demandé à la main) n'est pas doublé.
 */
import type { Pool, PoolClient } from "pg";
import { reglagesAffichables, type CodeAutomatisation } from "@/lib/automatisations/catalogue";
import { debutJour } from "@/server/queue/temps";
import { decider, type Faits, type Suivi } from "./relance-invitations";

const CLE_VERROU_MOTEUR = 727_002;
const CODE: CodeAutomatisation = "relance_invitations";

export type BilanAutomatisations =
  | { statut: "occupe" | "inactive" | "arret" }
  | { statut: "fait"; suivisMaj: number; tachesMisesEnFile: number; plafondAtteint: boolean };

const ACTION_TACHE = { retrait: "retrait_invitation", invitation: "invitation" } as const;

export async function executerAutomatisations(pool: Pool, maintenant = new Date(), aleatoire: () => number = Math.random): Promise<BilanAutomatisations> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await passage(c, maintenant, aleatoire);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function passage(c: PoolClient, maintenant: Date, aleatoire: () => number): Promise<BilanAutomatisations> {
  const verrou = await c.query("select pg_try_advisory_xact_lock($1) as ok", [CLE_VERROU_MOTEUR]);
  if (!verrou.rows[0].ok) return { statut: "occupe" };

  const a = await c.query("select id, active, reglages from public.automatisations where code = $1", [CODE]);
  const auto = a.rows[0] as { id: string; active: boolean; reglages: unknown } | undefined;
  if (!auto?.active) return { statut: "inactive" };
  const reg = await c.query("select arret_d_urgence, fuseau from public.reglages where id");
  if (reg.rows[0].arret_d_urgence) return { statut: "arret" };
  const reglages = reglagesAffichables(auto.reglages);

  const jour = debutJour(maintenant, reg.rows[0].fuseau);
  const deja = await c.query(
    "select count(*)::int as n from public.taches where automatisation_id = $1 and created_at >= $2 and created_at < $2::timestamptz + interval '1 day'",
    [auto.id, jour],
  );
  let restantes = reglages.plafond_jour - deja.rows[0].n;

  // Prospects du CRM : déjà suivis (sauf terminés), ou en attente d'acceptation sans suivi.
  // Échéances les plus anciennes d'abord : le plafond sert d'abord les invitations les plus vieilles.
  const lignes = await c.query(
    `select p.id as prospect_id, p.statut_relation, e.terminale as etape_terminale,
            (select max(l.date_lien) from public.liens_linkedin l
              where l.type = 'invitation_envoyee'
                and (l.url_normalisee = p.url_normalisee or (p.provider_id is not null and l.provider_id = p.provider_id))) as invitation_le,
            exists (select 1 from public.liens_linkedin l
                     where l.type = 'invitation_envoyee' and l.invitation_id is not null
                       and (l.url_normalisee = p.url_normalisee or (p.provider_id is not null and l.provider_id = p.provider_id))) as id_connu,
            (select max(x.created_at) from public.actions x
              where x.prospect_id = p.id and x.type = 'retrait_invitation' and x.resultat = 'succes') as retrait_le,
            (select t.type_action::text from public.taches t
              where t.prospect_id = p.id and t.automatisation_id = $1 and t.statut in ('en_attente', 'en_cours', 'incertaine')
              limit 1) as tache_auto,
            exists (select 1 from public.taches t
                     where t.prospect_id = p.id and t.automatisation_id is distinct from $1
                       and t.type_action in ('invitation', 'retrait_invitation')
                       and t.statut in ('en_attente', 'en_cours', 'incertaine')) as tache_manuelle,
            s.id as suivi_id, s.etat, s.cycle, s.prochaine_decision_le, s.invitation_envoyee_le, s.retiree_le, s.motif
       from public.prospects p
       join public.etapes e on e.code = p.etape
       left join public.suivis_automatisation s on s.prospect_id = p.id and s.automatisation_id = $1
      where not p.demo
        and ((s.id is not null and s.etat <> 'termine') or (s.id is null and p.statut_relation = 'en_attente'))
      order by s.prochaine_decision_le asc nulls first, p.id`,
    [auto.id],
  );

  let suivisMaj = 0;
  let tachesMisesEnFile = 0;
  let plafondAtteint = false;

  for (const x of lignes.rows) {
    const avant: Suivi | null = x.suivi_id
      ? {
          etat: x.etat,
          cycle: x.cycle,
          prochaineDecisionLe: x.prochaine_decision_le,
          invitationEnvoyeeLe: x.invitation_envoyee_le,
          retireeLe: x.retiree_le,
          motif: x.motif,
        }
      : null;
    const faits: Faits = {
      statutRelation: x.statut_relation,
      etapeTerminale: x.etape_terminale,
      invitationEnvoyeeLe: x.invitation_le,
      invitationIdConnu: x.id_connu,
      dernierRetraitLe: x.retrait_le,
      tacheEnFile: x.tache_auto === "retrait_invitation" ? "retrait" : x.tache_auto === "invitation" ? "invitation" : null,
    };
    const d = decider(avant, faits, reglages, maintenant, aleatoire);
    if (!d.suivi) continue;

    if (d.mettreEnFile) {
      // Action demandée à la main déjà en file : on ne double pas, la décision attend.
      if (x.tache_manuelle) continue;
      if (restantes <= 0) {
        plafondAtteint = true;
        continue;
      }
      const echeance = avant?.prochaineDecisionLe?.getTime() ?? maintenant.getTime();
      const t = await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, executer_apres, automatisation_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $5) on conflict (cle_idempotence) do nothing`,
        [
          ACTION_TACHE[d.mettreEnFile],
          x.prospect_id,
          { prospect_id: x.prospect_id },
          `auto:${CODE}:${x.prospect_id}:${d.suivi.cycle}:${d.mettreEnFile}:${echeance}`,
          maintenant,
          auto.id,
        ],
      );
      if (t.rowCount) {
        tachesMisesEnFile++;
        restantes--;
      }
    }

    if (!avant || JSON.stringify(avant) !== JSON.stringify(d.suivi)) {
      await enregistrerSuivi(c, auto.id, x.prospect_id, d.suivi, maintenant);
      suivisMaj++;
    }
  }
  return { statut: "fait", suivisMaj, tachesMisesEnFile, plafondAtteint };
}

async function enregistrerSuivi(c: PoolClient, automatisationId: string, prospectId: string, s: Suivi, maintenant: Date) {
  await c.query(
    `insert into public.suivis_automatisation
       (automatisation_id, prospect_id, etat, cycle, prochaine_decision_le, invitation_envoyee_le, retiree_le, motif, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     on conflict (automatisation_id, prospect_id) do update
       set etat = excluded.etat, cycle = excluded.cycle, prochaine_decision_le = excluded.prochaine_decision_le,
           invitation_envoyee_le = excluded.invitation_envoyee_le, retiree_le = excluded.retiree_le,
           motif = excluded.motif, updated_at = excluded.updated_at`,
    [automatisationId, prospectId, s.etat, s.cycle, s.prochaineDecisionLe, s.invitationEnvoyeeLe, s.retireeLe, s.motif, maintenant],
  );
}
