import type { Pool } from "pg";
import { reglagesAffichables, type ReglagesRelance } from "@/lib/automatisations/catalogue";
import { debutJour } from "@/server/queue/temps";
import type { EtatSuivi } from "./relance-invitations";

/**
 * Lecture des automatisations pour la page Workflow (sans contrôle d'accès : appelée derrière
 * `exigerUtilisateur()` par `donnees.ts`, et directement par les tests).
 */

export const ETATS_SUIVI: EtatSuivi[] = ["attente_retrait", "retrait_en_file", "attente_reinvitation", "reinvitation_en_file", "mis_de_cote", "termine"];

export interface ActionPrevue {
  date: Date;
  prospectId: string;
  nom: string;
  action: "retrait" | "invitation";
  /** Déjà dans la file d'attente (sinon : décision prévue à cette date). */
  enFile: boolean;
}

export interface ActionFaite {
  date: Date;
  prospectId: string | null;
  nom: string;
  action: "retrait" | "invitation";
  resultat: string;
}

export interface AutomatisationAffichee {
  id: string;
  code: string;
  nom: string;
  active: boolean;
  activeLe: Date | null;
  reglages: ReglagesRelance;
  compteurs: Record<EtatSuivi, number>;
  aujourdhui: { misEnFile: number; plafond: number };
  prochaines: ActionPrevue[];
  dernieres: ActionFaite[];
}

const NOM = "coalesce(nullif(concat_ws(' ', p.prenom, p.nom), ''), 'Prospect')";

export async function automatisationsDepuis(pool: Pool, maintenant = new Date()): Promise<AutomatisationAffichee[]> {
  const a = await pool.query("select id, code, nom, active, active_le, reglages from public.automatisations order by created_at, code");
  const fuseau: string = (await pool.query("select fuseau from public.reglages where id")).rows[0].fuseau;
  const jour = debutJour(maintenant, fuseau);
  const sortie: AutomatisationAffichee[] = [];

  for (const x of a.rows) {
    const reglages = reglagesAffichables(x.reglages);
    const [compteurs, aujourdhui, prochaines, dernieres] = await Promise.all([
      pool.query("select etat, count(*)::int as n from public.suivis_automatisation where automatisation_id = $1 group by etat", [x.id]),
      pool.query(
        "select count(*)::int as n from public.taches where automatisation_id = $1 and created_at >= $2 and created_at < $2::timestamptz + interval '1 day'",
        [x.id, jour],
      ),
      pool.query(
        `select * from (
           select coalesce(t.depart_estime, t.executer_apres) as date, t.prospect_id, ${NOM} as nom,
                  case t.type_action when 'retrait_invitation' then 'retrait' else 'invitation' end as action, true as en_file
             from public.taches t join public.prospects p on p.id = t.prospect_id
            where t.automatisation_id = $1 and t.statut in ('en_attente', 'en_cours', 'incertaine')
           union all
           select s.prochaine_decision_le, s.prospect_id, ${NOM},
                  case s.etat when 'attente_retrait' then 'retrait' else 'invitation' end, false
             from public.suivis_automatisation s join public.prospects p on p.id = s.prospect_id
            where s.automatisation_id = $1 and s.etat in ('attente_retrait', 'attente_reinvitation') and s.prochaine_decision_le is not null
         ) x order by date limit 10`,
        [x.id],
      ),
      pool.query(
        `select a.created_at as date, a.prospect_id, ${NOM} as nom,
                case a.type when 'retrait_invitation' then 'retrait' else 'invitation' end as action, a.resultat
           from public.actions a
           join public.taches t on t.id = a.tache_id
           left join public.prospects p on p.id = a.prospect_id
          where t.automatisation_id = $1 and a.sortante and a.type in ('retrait_invitation', 'invitation')
          order by a.created_at desc limit 10`,
        [x.id],
      ),
    ]);
    const parEtat = Object.fromEntries(ETATS_SUIVI.map((e) => [e, 0])) as Record<EtatSuivi, number>;
    for (const r of compteurs.rows) if (r.etat in parEtat) parEtat[r.etat as EtatSuivi] = r.n;

    sortie.push({
      id: x.id,
      code: x.code,
      nom: x.nom,
      active: x.active,
      activeLe: x.active_le,
      reglages,
      compteurs: parEtat,
      aujourdhui: { misEnFile: aujourdhui.rows[0].n, plafond: reglages.plafond_jour },
      prochaines: prochaines.rows.map((r) => ({ date: r.date, prospectId: r.prospect_id, nom: r.nom, action: r.action, enFile: r.en_file })),
      dernieres: dernieres.rows.map((r) => ({ date: r.date, prospectId: r.prospect_id, nom: r.nom, action: r.action, resultat: r.resultat })),
    });
  }
  return sortie;
}
