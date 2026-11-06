import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { exigerUtilisateur } from "./auth";
import { poolServeur } from "./db";
import { chargerContexte } from "./queue/worker";
import { TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";

/**
 * Couche d'accès aux données pour l'interface. Chaque fonction exportée vérifie
 * d'abord la session ET l'autorisation (exigerUtilisateur), puis lit en base.
 * Les fonctions « …Depuis » (sans contrôle) servent aux tests.
 */

// ─── Jauge de quotas et état de la file ───────────────────────────────────────

export interface EtatOutil {
  quotas: Record<TypeQuota, { plafond: { jour: number | null; semaine: number | null; mois: number | null }; compteur: { jour: number; semaine: number; mois: number }; gelJusqua: Date | null }>;
  arretDurgence: boolean;
  enAttente: number;
  incertaines: number;
  etatFile: "en_cours" | "en_pause" | "gele";
}

export async function etatOutilDepuis(pool: Pool, maintenant = new Date()): Promise<EtatOutil> {
  const ctx = await chargerContexte(pool, maintenant);
  const f = await pool.query(
    "select count(*) filter (where statut = 'en_attente')::int as en_attente, count(*) filter (where statut = 'incertaine')::int as incertaines from public.taches",
  );
  const quotas = {} as EtatOutil["quotas"];
  for (const t of TYPES_QUOTA) {
    quotas[t] = { plafond: ctx.quotas[t].plafond, compteur: ctx.compteurs[t], gelJusqua: ctx.quotas[t].gelJusqua };
  }
  const unGel = TYPES_QUOTA.some((t) => {
    const g = ctx.quotas[t].gelJusqua;
    return g && g.getTime() > maintenant.getTime();
  });
  return {
    quotas,
    arretDurgence: ctx.reglages.arretDurgence,
    enAttente: f.rows[0].en_attente,
    incertaines: f.rows[0].incertaines,
    etatFile: ctx.reglages.arretDurgence ? "en_pause" : unGel ? "gele" : "en_cours",
  };
}

export async function etatOutil() {
  await exigerUtilisateur();
  return etatOutilDepuis(poolServeur());
}

// ─── Prospects ────────────────────────────────────────────────────────────────

export const filtresProspectsSchema = z.object({
  statut: z.enum(["en_relation", "en_attente", "invitation_recue", "a_inviter"]).optional(),
  etape: z.string().max(50).optional(),
  liste: z.string().max(100).optional(),
  relanceAvant: z.iso.date().optional(),
  recherche: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type FiltresProspects = z.infer<typeof filtresProspectsSchema>;

export interface LigneProspect {
  id: string;
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  entreprise: string | null;
  linkedinUrl: string;
  listeOrigine: string | null;
  statutRelation: string;
  etape: string;
  prochaineRelance: string | null;
  identifie: boolean;
}

export const TAILLE_PAGE = 50;

export async function prospectsDepuis(pool: Pool, filtres: FiltresProspects) {
  const r = await pool.query(
    `select id, prenom, nom, poste, entreprise, linkedin_url, liste_origine, statut_relation, etape,
            to_char(prochaine_relance, 'YYYY-MM-DD') as prochaine_relance, provider_id is not null as identifie,
            count(*) over ()::int as total
       from public.prospects
      where ($1::public.statut_relation is null or statut_relation = $1)
        and ($2::text is null or etape = $2)
        and ($3::text is null or liste_origine = $3)
        and ($4::date is null or prochaine_relance <= $4)
        and ($5::text is null or concat_ws(' ', prenom, nom, entreprise, poste) ilike '%' || $5 || '%')
      order by coalesce(nom, ''), coalesce(prenom, ''), id
      limit $6 offset $7`,
    [
      filtres.statut ?? null,
      filtres.etape ?? null,
      filtres.liste ?? null,
      filtres.relanceAvant ?? null,
      filtres.recherche ? filtres.recherche.replace(/[\\%_]/g, (m) => `\\${m}`) : null,
      TAILLE_PAGE,
      (filtres.page - 1) * TAILLE_PAGE,
    ],
  );
  const lignes: LigneProspect[] = r.rows.map((x) => ({
    id: x.id,
    prenom: x.prenom,
    nom: x.nom,
    poste: x.poste,
    entreprise: x.entreprise,
    linkedinUrl: x.linkedin_url,
    listeOrigine: x.liste_origine,
    statutRelation: x.statut_relation,
    etape: x.etape,
    prochaineRelance: x.prochaine_relance,
    identifie: x.identifie,
  }));
  return { lignes, total: (r.rows[0]?.total as number | undefined) ?? 0 };
}

export async function prospects(filtres: FiltresProspects) {
  await exigerUtilisateur();
  return prospectsDepuis(poolServeur(), filtres);
}

export async function referentielsDepuis(pool: Pool) {
  const [etapes, listes] = await Promise.all([
    pool.query("select code, libelle from public.etapes order by ordre"),
    pool.query("select distinct liste_origine from public.prospects where liste_origine is not null order by 1"),
  ]);
  return {
    etapes: etapes.rows as { code: string; libelle: string }[],
    listes: listes.rows.map((r) => r.liste_origine as string),
  };
}

export async function referentiels() {
  await exigerUtilisateur();
  return referentielsDepuis(poolServeur());
}

// ─── File d'attente ───────────────────────────────────────────────────────────

export interface LigneTache {
  id: string;
  ordre: number;
  type: string;
  statut: string;
  prospect: string | null;
  motif: string | null;
  departEstime: Date | null;
  executerApres: Date;
  derniereErreur: string | null;
  texte: string | null;
}

export async function fileDepuis(pool: Pool): Promise<LigneTache[]> {
  const r = await pool.query(
    `select t.id, t.ordre, t.type_action, t.statut, t.motif_attente, t.depart_estime, t.executer_apres,
            t.derniere_erreur, t.payload ->> 'texte' as texte,
            nullif(concat_ws(' ', p.prenom, p.nom), '') as prospect
       from public.taches t left join public.prospects p on p.id = t.prospect_id
      where t.statut in ('en_attente', 'en_cours', 'incertaine')
      order by (t.statut = 'incertaine') desc, t.ordre
      limit 500`,
  );
  return r.rows.map((x) => ({
    id: x.id,
    ordre: Number(x.ordre),
    type: x.type_action,
    statut: x.statut,
    prospect: x.prospect,
    motif: x.motif_attente,
    departEstime: x.depart_estime,
    executerApres: x.executer_apres,
    derniereErreur: x.derniere_erreur,
    texte: x.texte,
  }));
}

export async function fileAttente() {
  await exigerUtilisateur();
  return fileDepuis(poolServeur());
}

// ─── Réglages ─────────────────────────────────────────────────────────────────

export async function reglagesDepuis(pool: Pool) {
  const r = await pool.query(
    "select plages, delai_min_s, delai_max_s, cadence_relances, arret_d_urgence from public.reglages where id",
  );
  const q = await pool.query("select type_quota, plafond_jour, plafond_semaine, plafond_mois from public.quotas");
  return {
    plages: r.rows[0].plages as { jours: number[]; creneaux: { debut: string; fin: string }[] },
    delaiMinS: r.rows[0].delai_min_s as number,
    delaiMaxS: r.rows[0].delai_max_s as number,
    cadence: r.rows[0].cadence_relances as { relance_1_jours: number; relance_2_jours: number },
    arretDurgence: r.rows[0].arret_d_urgence as boolean,
    plafonds: Object.fromEntries(
      q.rows.map((x) => [x.type_quota, { jour: x.plafond_jour, semaine: x.plafond_semaine, mois: x.plafond_mois }]),
    ) as Record<TypeQuota, { jour: number | null; semaine: number | null; mois: number | null }>,
  };
}

export async function reglages() {
  await exigerUtilisateur();
  return reglagesDepuis(poolServeur());
}
