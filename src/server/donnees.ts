import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { detailsAffichables } from "@/lib/listes";
import { exigerUtilisateur } from "./auth";
import { poolServeur } from "./db";
import { envUnipile } from "./env-serveur";
import { chargerContexte } from "./queue/worker";
import { TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";
import { termesRecherche, TRANSLATE_DE, TRANSLATE_VERS } from "@/lib/recherche";

/**
 * Couche d'accès aux données pour l'interface. Chaque fonction exportée vérifie
 * d'abord la session ET l'autorisation (exigerUtilisateur), puis lit en base.
 * Les fonctions « …Depuis » (sans contrôle) servent aux tests.
 */

// ─── Jauge de quotas et état de la file ───────────────────────────────────────

export interface EtatOutil {
  quotas: Record<
    TypeQuota,
    {
      plafond: { jour: number | null; semaine: number | null; mois: number | null };
      compteur: { jour: number; semaine: number; mois: number };
      gelJusqua: Date | null;
      gele: boolean;
    }
  >;
  arretDurgence: boolean;
  enAttente: number;
  incertaines: number;
  etatFile: "en_cours" | "en_pause" | "gele";
  modeSimule: boolean;
  prospectsDemo: number;
  nonLus: number;
}

export async function etatOutilDepuis(pool: Pool, maintenant = new Date()): Promise<EtatOutil> {
  const ctx = await chargerContexte(pool, maintenant);
  const f = await pool.query(
    `select count(*) filter (where statut = 'en_attente')::int as en_attente,
            count(*) filter (where statut = 'incertaine')::int as incertaines,
            (select count(*) from public.prospects where demo)::int as demo,
            (select count(*) from public.conversations where non_lu)::int as non_lus
       from public.taches`,
  );
  const quotas = {} as EtatOutil["quotas"];
  for (const t of TYPES_QUOTA) {
    const gelJusqua = ctx.quotas[t].gelJusqua;
    quotas[t] = {
      plafond: ctx.quotas[t].plafond,
      compteur: ctx.compteurs[t],
      gelJusqua,
      gele: !!gelJusqua && gelJusqua.getTime() > maintenant.getTime(),
    };
  }
  const unGel = TYPES_QUOTA.some((t) => quotas[t].gele);
  return {
    quotas,
    arretDurgence: ctx.reglages.arretDurgence,
    enAttente: f.rows[0].en_attente,
    incertaines: f.rows[0].incertaines,
    etatFile: ctx.reglages.arretDurgence ? "en_pause" : unGel ? "gele" : "en_cours",
    modeSimule: envUnipile().mode === "simule",
    prospectsDemo: f.rows[0].demo,
    nonLus: f.rows[0].non_lus,
  };
}

export async function etatOutil() {
  await exigerUtilisateur();
  return etatOutilDepuis(poolServeur());
}

// ─── Prospects ────────────────────────────────────────────────────────────────

export { filtresProspectsSchema, type FiltresProspects } from "@/lib/filtres/prospects";
import type { FiltresProspects } from "@/lib/filtres/prospects";

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
        and not exists (
              select 1 from unnest($5::text[]) as terme
               where position(terme in translate(lower(concat_ws(' ', prenom, nom, entreprise, poste)), $8, $9)) = 0
            )
      order by coalesce(nom, ''), coalesce(prenom, ''), id
      limit $6 offset $7`,
    [
      filtres.statut ?? null,
      filtres.etape ?? null,
      filtres.liste ?? null,
      filtres.relanceAvant ?? null,
      termesRecherche(filtres.recherche ?? ""),
      TAILLE_PAGE,
      (filtres.page - 1) * TAILLE_PAGE,
      TRANSLATE_DE,
      TRANSLATE_VERS,
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

// ─── Fiche prospect ───────────────────────────────────────────────────────────

export interface EvenementHistorique {
  date: Date;
  type: string;
  resultat: string | null;
  enFile: boolean;
}

export interface FicheProspect extends LigneProspect {
  notes: string | null;
  /** Informations propres à la liste d'origine, déjà filtrées et revalidées (src/lib/listes.ts). */
  informationsListe: ReturnType<typeof detailsAffichables>;
  historique: EvenementHistorique[];
}

export async function ficheProspectDepuis(pool: Pool, id: unknown): Promise<FicheProspect | null> {
  const parse = z.uuid().safeParse(id);
  if (!parse.success) return null;
  const p = await pool.query(
    `select id, prenom, nom, poste, entreprise, linkedin_url, liste_origine, statut_relation, etape, notes, details,
            to_char(prochaine_relance, 'YYYY-MM-DD') as prochaine_relance, provider_id is not null as identifie
       from public.prospects where id = $1`,
    [parse.data],
  );
  if (!p.rowCount) return null;
  const h = await pool.query(
    `select created_at as date, type, resultat, false as en_file from public.actions where prospect_id = $1
     union all
     select coalesce(depart_estime, executer_apres), type_action::text, null, true
       from public.taches where prospect_id = $1 and statut in ('en_attente', 'en_cours', 'incertaine')
     order by 1 desc limit 100`,
    [parse.data],
  );
  const x = p.rows[0];
  return {
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
    notes: x.notes,
    informationsListe: detailsAffichables(x.liste_origine, x.details),
    historique: h.rows.map((r) => ({ date: r.date, type: r.type, resultat: r.resultat, enFile: r.en_file })),
  };
}

export async function ficheProspect(id: unknown) {
  await exigerUtilisateur();
  return ficheProspectDepuis(poolServeur(), id);
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

// ─── Inbox ────────────────────────────────────────────────────────────────────

export { filtresInboxSchema, type FiltresInbox } from "@/lib/filtres/inbox";
import { filtresInboxSchema, type FiltresInbox } from "@/lib/filtres/inbox";

export interface LigneConversation {
  id: string;
  prospectId: string | null;
  nom: string;
  sousTitre: string | null;
  etape: string | null;
  apercu: string;
  dernierSens: "entrant" | "sortant";
  dernierMessageAt: Date | null;
  nonLu: boolean;
}

export const TAILLE_PAGE_INBOX = 100;

/** Conversations de l'Inbox selon les filtres (standard src/lib/filtres : mêmes règles qu'en local). */
export async function inboxDepuis(pool: Pool, filtres: FiltresInbox): Promise<{ lignes: LigneConversation[]; total: number }> {
  const r = await pool.query(
    `with conv as (
       select c.id, c.prospect_id, c.non_lu, c.dernier_message_at,
              coalesce(nullif(concat_ws(' ', p.prenom, p.nom), ''), c.interlocuteur_nom, 'Inconnu') as nom,
              nullif(concat_ws(' · ', p.poste, p.entreprise), '') as sous_titre, p.etape,
              coalesce(m.texte, '') as apercu, coalesce(m.sens, 'sortant') as dernier_sens
         from public.conversations c
         left join public.prospects p on p.id = c.prospect_id
         left join lateral (
           select texte, sens from public.messages where conversation_id = c.id order by envoye_at desc limit 1
         ) m on true
     )
     select *, count(*) over ()::int as total
       from conv
      where (not $1::boolean or non_lu)
        and (not $2::boolean or dernier_sens = 'entrant')
        and (not $3::boolean or prospect_id is null)
        and not exists (
              select 1 from unnest($4::text[]) as terme
               where position(terme in translate(lower(concat_ws(' ', nom, sous_titre, apercu)), $5, $6)) = 0
            )
      order by dernier_message_at desc nulls last, id
      limit $7 offset $8`,
    [
      filtres.nonLus === "oui",
      filtres.aTraiter === "oui",
      filtres.horsCrm === "oui",
      termesRecherche(filtres.recherche ?? ""),
      TRANSLATE_DE,
      TRANSLATE_VERS,
      TAILLE_PAGE_INBOX,
      (filtres.page - 1) * TAILLE_PAGE_INBOX,
    ],
  );
  const lignes = r.rows.map((x) => ({
    id: x.id,
    prospectId: x.prospect_id,
    nom: x.nom,
    sousTitre: x.sous_titre,
    etape: x.etape,
    apercu: x.apercu,
    dernierSens: x.dernier_sens,
    dernierMessageAt: x.dernier_message_at,
    nonLu: x.non_lu,
  }));
  return { lignes, total: r.rows[0]?.total ?? 0 };
}

export async function inbox(filtres: unknown) {
  await exigerUtilisateur();
  return inboxDepuis(poolServeur(), filtresInboxSchema.parse(filtres));
}

export interface MessageFil {
  id: string;
  sens: "entrant" | "sortant";
  texte: string;
  envoyeAt: Date;
  /** « envoye » pour l'historique ; les messages encore dans la file portent leur état. */
  statut: "envoye" | "en_file" | "en_cours" | "incertain";
}

/**
 * Fil d'une conversation (par son id, ou la plus récente d'un prospect). Pour un prospect sans
 * conversation, renvoie un fil vide (id null) avec ses premiers messages encore en file.
 */
export async function filDepuis(pool: Pool, cle: { conversationId?: unknown; prospectId?: unknown }) {
  const conv = z.uuid().safeParse(cle.conversationId);
  const prospect = z.uuid().safeParse(cle.prospectId);
  if (!conv.success && !prospect.success) return null;
  const c = await pool.query(
    `select c.id, c.prospect_id, c.non_lu, c.demo,
            coalesce(nullif(concat_ws(' ', p.prenom, p.nom), ''), c.interlocuteur_nom, 'Inconnu') as nom,
            nullif(concat_ws(' · ', p.poste, p.entreprise), '') as sous_titre
       from public.conversations c left join public.prospects p on p.id = c.prospect_id
      where ($1::uuid is not null and c.id = $1) or ($2::uuid is not null and c.prospect_id = $2)
      order by c.dernier_message_at desc nulls last limit 1`,
    [conv.success ? conv.data : null, prospect.success ? prospect.data : null],
  );
  const x = c.rows[0];
  let entete: { id: string | null; prospectId: string | null; nom: string; sousTitre: string | null; nonLu: boolean; demo: boolean };
  if (x) {
    entete = { id: x.id, prospectId: x.prospect_id, nom: x.nom, sousTitre: x.sous_titre, nonLu: x.non_lu, demo: x.demo };
  } else {
    if (!prospect.success) return null;
    const p = await pool.query(
      `select id, demo, coalesce(nullif(concat_ws(' ', prenom, nom), ''), 'Prospect') as nom,
              nullif(concat_ws(' · ', poste, entreprise), '') as sous_titre
         from public.prospects where id = $1`,
      [prospect.data],
    );
    if (!p.rowCount) return null;
    const y = p.rows[0];
    entete = { id: null, prospectId: y.id, nom: y.nom, sousTitre: y.sous_titre, nonLu: false, demo: y.demo };
  }
  const m = entete.id
    ? await pool.query("select id, sens, texte, envoye_at from public.messages where conversation_id = $1 order by envoye_at limit 500", [entete.id])
    : { rows: [] };
  // Messages rédigés dans l'outil, encore dans la file (dans cette conversation, ou premiers
  // messages au prospect) : affichés à la suite, avec leur état.
  const enFile = await pool.query(
    `select id, payload->>'texte' as texte, coalesce(depart_estime, executer_apres) as quand, statut
       from public.taches
      where type_action = 'message' and statut in ('en_attente', 'en_cours', 'incertaine')
        and (($1::text is not null and payload->>'conversation_id' = $1::text)
             or ($2::text is not null and payload->>'prospect_id' = $2::text))
      order by ordre`,
    [entete.id, entete.prospectId],
  );
  const etat = { en_attente: "en_file", en_cours: "en_cours", incertaine: "incertain" } as const;
  return {
    ...entete,
    messages: [
      ...m.rows.map((r): MessageFil => ({ id: r.id, sens: r.sens, texte: r.texte, envoyeAt: r.envoye_at, statut: "envoye" })),
      ...enFile.rows.map(
        (r): MessageFil => ({ id: `file-${r.id}`, sens: "sortant", texte: r.texte, envoyeAt: r.quand, statut: etat[r.statut as keyof typeof etat] }),
      ),
    ],
  };
}

export async function fil(cle: { conversationId?: unknown; prospectId?: unknown }) {
  await exigerUtilisateur();
  return filDepuis(poolServeur(), cle);
}

// ─── Indicateurs de la liste de prospects ─────────────────────────────────────

export interface StatsProspects {
  total: number;
  parStatut: Record<"en_relation" | "en_attente" | "invitation_recue" | "a_inviter", number>;
  aTraiter: number;
  relancesDues: number;
}

export async function statsProspectsDepuis(pool: Pool): Promise<StatsProspects> {
  const r = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where statut_relation = 'en_relation')::int as en_relation,
            count(*) filter (where statut_relation = 'en_attente')::int as en_attente,
            count(*) filter (where statut_relation = 'invitation_recue')::int as invitation_recue,
            count(*) filter (where statut_relation = 'a_inviter')::int as a_inviter,
            count(*) filter (where prochaine_relance <= (now() at time zone 'Europe/Paris')::date
                             and etape not in (select code from public.etapes where terminale))::int as relances_dues,
            (select count(*) from public.conversations c
              where (select sens from public.messages m where m.conversation_id = c.id order by envoye_at desc limit 1) = 'entrant')::int as a_traiter
       from public.prospects`,
  );
  const x = r.rows[0];
  return {
    total: x.total,
    parStatut: { en_relation: x.en_relation, en_attente: x.en_attente, invitation_recue: x.invitation_recue, a_inviter: x.a_inviter },
    aTraiter: x.a_traiter,
    relancesDues: x.relances_dues,
  };
}

export async function statsProspects() {
  await exigerUtilisateur();
  return statsProspectsDepuis(poolServeur());
}

// ─── Statistiques : entonnoir par étape, activité par jour ───────────────────

export interface EtapeEntonnoir {
  code: string;
  libelle: string;
  valeur: number;
}

/**
 * Entonnoir : étapes non terminales puis la première étape terminale (« Gagné »).
 * Chaque étape compte les prospects qui l'ont atteinte : étape actuelle, ou plus haute étape
 * franchie d'après le journal (un prospect « Perdu » après « Connecté » compte jusqu'à « Connecté »).
 * Les autres étapes terminales (Perdu, Pas intéressé) sont des sorties, comptées à part.
 */
export async function entonnoirDepuis(pool: Pool): Promise<{ etapes: EtapeEntonnoir[]; sorties: EtapeEntonnoir[] }> {
  const r = await pool.query(
    `with etapes_ordonnees as (
       select code, libelle, ordre, terminale,
              not terminale or ordre = (select min(ordre) from public.etapes where terminale) as dans_entonnoir
         from public.etapes
     ),
     entonnoir as (select code, ordre from etapes_ordonnees where dans_entonnoir),
     atteint as (
       select p.id,
              greatest(
                (select min(ordre) from entonnoir),
                (select e.ordre from entonnoir e where e.code = p.etape),
                (select max(e.ordre) from public.actions a join entonnoir e on e.code = a.details->>'vers'
                  where a.prospect_id = p.id and a.type = 'changement_etape')
              ) as ordre
         from public.prospects p
     )
     select eo.code, eo.libelle, eo.dans_entonnoir,
            case when eo.dans_entonnoir
                 then (select count(*) from atteint where atteint.ordre >= eo.ordre)
                 else (select count(*) from public.prospects p where p.etape = eo.code)
            end::int as valeur
       from etapes_ordonnees eo
      order by eo.ordre`,
  );
  const ligne = (x: { code: string; libelle: string; valeur: number }) => ({ code: x.code, libelle: x.libelle, valeur: x.valeur });
  return {
    etapes: r.rows.filter((x) => x.dans_entonnoir).map(ligne),
    sorties: r.rows.filter((x) => !x.dans_entonnoir).map(ligne),
  };
}

export interface JourActivite {
  jour: string; // AAAA-MM-JJ, heure de Paris
  total: number;
  invitations: number;
  messages: number;
  lectures: number;
}

const jourParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

/**
 * Activité de prospection : actions LinkedIn réussies (invitations, messages, lectures de profil)
 * par jour de Paris, sur `semaines` semaines complètes du lundi au jour courant.
 * Les synchronisations de liste sont techniques et ne comptent pas.
 */
export async function activiteDepuis(pool: Pool, maintenant = new Date(), semaines = 26) {
  const fin = jourParis.format(maintenant);
  const d = new Date(`${fin}T00:00:00Z`);
  const lundi = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const debut = new Date(lundi.getTime() - (semaines - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  const r = await pool.query(
    `select to_char((created_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as jour,
            count(*)::int as total,
            count(*) filter (where type = 'invitation')::int as invitations,
            count(*) filter (where type = 'message')::int as messages,
            count(*) filter (where type = 'lecture_profil')::int as lectures
       from public.actions
      where sortante and resultat = 'succes' and type in ('invitation', 'message', 'lecture_profil')
        and (created_at at time zone 'Europe/Paris')::date between $1::date and $2::date
      group by 1 order by 1`,
    [debut, fin],
  );
  const jours: JourActivite[] = r.rows;
  return { debut, fin, jours, joursActifs: jours.length };
}

export async function statistiques() {
  await exigerUtilisateur();
  const pool = poolServeur();
  const [entonnoir, activite] = await Promise.all([entonnoirDepuis(pool), activiteDepuis(pool)]);
  return { entonnoir, activite };
}
