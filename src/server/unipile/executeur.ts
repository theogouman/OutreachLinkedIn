import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import type { TypeLien } from "@/lib/statut-relation";
import type { AppliquerEffets, ExecuteurLinkedIn, ResultatAppel } from "@/server/queue/worker";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations, type LienLinkedIn } from "@/server/relations";
import type { ClientLinkedIn, Liste, PersonneListee, ProfilLu } from "./types";
import { telechargerPhoto as telechargerPhotoLinkedIn, type Photo } from "./photo";
import { rattacherConversations } from "@/server/conversations";
import { prospectDuMemeNom } from "@/server/completion-conversations";
import { cleNom, cleNomSql, TRANSLATE_DE, TRANSLATE_VERS } from "@/lib/recherche";

const listeSchema = z.enum(["relations", "invitations_envoyees", "invitations_recues"]);
const payloadLectureProfil = z.object({
  public_identifier: z.string().min(3).max(100),
  /** Lecture d'identification de l'interlocuteur d'une conversation hors CRM. */
  conversation_id: z.uuid().optional(),
});
const payloadMessage = z.object({
  conversation_id: z.uuid(),
  chat_id: z.string().min(1).max(200),
  texte: z.string().min(1).max(8000),
});
/** Premier message à un prospect : la conversation est résolue (ou démarrée) au moment de l'envoi. */
const payloadPremierMessage = z.object({
  prospect_id: z.uuid(),
  texte: z.string().min(1).max(8000),
});
/**
 * Lecture d'une liste. `complete` : parcours de toutes les pages (synchronisation initiale), une tâche
 * par page, la suivante mise en file avec le curseur ; sinon première page seulement.
 */
const payloadLectureListe = z.object({
  liste: listeSchema,
  limite: z.number().int().min(1).max(500).default(50),
  curseur: z.string().min(1).max(4000).optional(),
  /** Suite par décalage, quand Unipile ne renvoie pas de curseur (liste des invitations). */
  offset: z.number().int().min(1).max(20_000).optional(),
  /** Premier identifiant de la page précédente : une page identique (décalage ignoré) arrête le parcours. */
  premier: z.string().max(200).optional(),
  complete: z.boolean().optional(),
  page: z.number().int().min(1).max(500).optional(),
  /** Début du parcours complet (lecture de la première page), transmis de page en page. */
  debut: z.iso.datetime({ offset: true }).optional(),
});
type PayloadLectureListe = z.infer<typeof payloadLectureListe>;

/** Pages au plus par parcours complet (garde-fou contre une boucle de curseurs). */
export const PAGES_MAX = 200;
/** Écart entre deux pages d'un parcours complet : 4 appels par heure au plus (documentation Unipile v2). */
export const ESPACEMENT_PAGES_MS = 15 * 60 * 1000;

type Donnees =
  | { genre: "profil"; profil: ProfilLu; photo: Photo | null; conversationId?: string }
  | { genre: "liste"; liste: Liste; personnes: PersonneListee[]; photos: Map<string, Photo>; suivant: string | null; payload: PayloadLectureListe }
  | { genre: "message"; conversationId: string; texte: string; messageId: string | null }
  | { genre: "conversation"; prospectId: string; chatId: string; providerId: string; texte: string; messageId: string | null };

/** État du destinataire d'un premier message, relu juste avant l'appel LinkedIn. */
export interface Destinataire {
  statutRelation: string;
  providerId: string | null;
  conversationId: string | null;
  chatId: string | null;
}
export type LireDestinataire = (prospectId: string) => Promise<Destinataire | null>;

/**
 * Personnes d'une liste dont la photo manque en base (prospect ou interlocuteur hors CRM) :
 * seules celles-ci sont téléchargées. Renvoie leurs provider_id.
 */
export type PhotosManquantes = (personnes: PersonneListee[]) => Promise<Set<string>>;

export function photosManquantesDepuis(pool: Pool): PhotosManquantes {
  return async (personnes) => {
    const avecPhoto = personnes.filter((p) => p.photoUrl);
    if (!avecPhoto.length) return new Set();
    const urls = avecPhoto.map((p) => (p.publicIdentifier && identifiantVersProfil(p.publicIdentifier)?.urlNormalisee) || "");
    const ids = avecPhoto.map((p) => p.providerId);
    // Sans URL (invitations) : nom normalisé, comparé aux prospects dont l'invitation est en attente.
    const noms = avecPhoto.map((p) => (!p.publicIdentifier && p.nom ? cleNom(p.nom) : ""));
    const r = await pool.query(
      `select x.provider_id from unnest($1::text[], $2::text[], $3::text[]) as x(provider_id, url, nom)
        where exists (select 1 from public.prospects p
                       where p.photo_maj is null and not p.demo and (p.provider_id = x.provider_id or (x.url <> '' and p.url_normalisee = x.url and p.provider_id is null)))
           or exists (select 1 from public.prospects p
                       where x.nom <> '' and p.photo_maj is null and not p.demo and p.provider_id is null and p.statut_relation = 'en_attente'
                         and ${cleNomSql("concat_ws(' ', p.prenom, p.nom)", "$4", "$5")} = x.nom)
           or exists (select 1 from public.conversations c
                       where c.prospect_id is null and c.photo_maj is null and c.interlocuteur_provider_id = x.provider_id)`,
      [ids, urls, noms, TRANSLATE_DE, TRANSLATE_VERS],
    );
    return new Set(r.rows.map((x) => x.provider_id as string));
  };
}

/** Téléchargements de photos en parallèle, par petits groupes (CDN public, aucun appel LinkedIn). */
async function telechargerPhotos(
  personnes: PersonneListee[],
  telecharger: (url: string) => Promise<Photo | null>,
): Promise<Map<string, Photo>> {
  const photos = new Map<string, Photo>();
  for (let i = 0; i < personnes.length; i += 8) {
    await Promise.all(
      personnes.slice(i, i + 8).map(async (p) => {
        const photo = p.photoUrl ? await telecharger(p.photoUrl).catch(() => null) : null;
        if (photo) photos.set(p.providerId, photo);
      }),
    );
  }
  return photos;
}

export function lireDestinataireDepuis(pool: Pool): LireDestinataire {
  return async (prospectId) => {
    const r = await pool.query(
      `select p.statut_relation, p.provider_id, c.id as conversation_id, c.unipile_chat_id
         from public.prospects p
         left join lateral (select id, unipile_chat_id from public.conversations
                             where prospect_id = p.id order by dernier_message_at desc nulls last limit 1) c on true
        where p.id = $1`,
      [prospectId],
    );
    if (!r.rowCount) return null;
    const x = r.rows[0];
    return { statutRelation: x.statut_relation, providerId: x.provider_id, conversationId: x.conversation_id, chatId: x.unipile_chat_id };
  };
}

const invalide = (type: string): ResultatAppel => ({ ok: false, erreur: { status: 400, type } });

/**
 * Traduit une tâche de la file en appel LinkedIn : lectures, messages, et premier message
 * (démarrage de conversation) à une relation de 1er degré, revérifiée juste avant l'appel.
 */
export function creerExecuteur(
  client: ClientLinkedIn,
  deps: {
    lireDestinataire?: LireDestinataire;
    telechargerPhoto?: (url: string) => Promise<Photo | null>;
    photosManquantes?: PhotosManquantes;
  } = {},
): ExecuteurLinkedIn {
  const telecharger = deps.telechargerPhoto ?? telechargerPhotoLinkedIn;
  return {
    async executer(tache) {
      if (tache.typeAction === "lecture_profil") {
        const p = payloadLectureProfil.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireProfil(p.data.public_identifier);
        if (!r.ok) return r;
        // Photo prise au passage (aucun appel LinkedIn en plus : CDN public) ; échec = pas de photo.
        const photo = r.donnees.photoUrl ? await telecharger(r.donnees.photoUrl).catch(() => null) : null;
        return { ok: true, donnees: { genre: "profil", profil: r.donnees, photo, conversationId: p.data.conversation_id } satisfies Donnees };
      }
      if (tache.typeAction === "lecture_liste") {
        const p = payloadLectureListe.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireListe(p.data.liste, p.data.limite, p.data.curseur, p.data.offset);
        if (!r.ok) return r;
        const manquantes = deps.photosManquantes ? await deps.photosManquantes(r.donnees.personnes).catch(() => new Set<string>()) : new Set<string>();
        const photos = await telechargerPhotos(
          r.donnees.personnes.filter((x) => manquantes.has(x.providerId)),
          telecharger,
        );
        return {
          ok: true,
          donnees: { genre: "liste", liste: p.data.liste, personnes: r.donnees.personnes, photos, suivant: r.donnees.suivant, payload: p.data } satisfies Donnees,
        };
      }
      if (tache.typeAction === "message" && payloadPremierMessage.safeParse(tache.payload).success) {
        const p = payloadPremierMessage.parse(tache.payload);
        if (!deps.lireDestinataire) return invalide("non_disponible");
        const d = await deps.lireDestinataire(p.prospect_id);
        if (!d) return invalide("prospect_introuvable");
        if (d.conversationId && d.chatId) {
          // Une conversation existe désormais (réponse reçue, ou premier message déjà parti) : on y écrit.
          const r = await client.envoyerMessage(d.chatId, p.texte);
          return r.ok
            ? { ok: true, donnees: { genre: "message", conversationId: d.conversationId, texte: p.texte, messageId: r.donnees.messageId } satisfies Donnees }
            : r;
        }
        // Message normal uniquement : sans relation de 1er degré, LinkedIn le bloquerait.
        if (d.statutRelation !== "en_relation") return invalide("pas_en_relation");
        if (!d.providerId) return invalide("identifiant_linkedin_inconnu");
        const r = await client.demarrerConversation(d.providerId, p.texte);
        return r.ok
          ? {
              ok: true,
              donnees: {
                genre: "conversation",
                prospectId: p.prospect_id,
                chatId: r.donnees.chatId,
                providerId: d.providerId,
                texte: p.texte,
                messageId: r.donnees.messageId,
              } satisfies Donnees,
            }
          : r;
      }
      if (tache.typeAction === "message") {
        const p = payloadMessage.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.envoyerMessage(p.data.chat_id, p.data.texte);
        return r.ok
          ? { ok: true, donnees: { genre: "message", conversationId: p.data.conversation_id, texte: p.data.texte, messageId: r.donnees.messageId } satisfies Donnees }
          : r;
      }
      // Invitations : pas encore disponibles.
      return invalide("non_disponible");
    },
  };
}

const TYPE_LIEN: Record<Liste, TypeLien> = {
  relations: "relation",
  invitations_envoyees: "invitation_envoyee",
  invitations_recues: "invitation_recue",
};

function urlDe(p: { publicIdentifier: string | null; providerId: string }): string {
  // Sans identifiant public, on garde le provider_id : le rapprochement se fait alors par lui.
  return (p.publicIdentifier && identifiantVersProfil(p.publicIdentifier)?.urlNormalisee) || `provider:${p.providerId}`;
}

async function effetsProfil(c: PoolClient, prospectId: string | null, tacheId: string, profil: ProfilLu, photo: Photo | null) {
  if (!prospectId) return;
  const prospect = await c.query("select url_normalisee from public.prospects where id = $1", [prospectId]);
  if (!prospect.rowCount) return; // supprimé entre-temps
  const url: string = prospect.rows[0].url_normalisee;

  if (photo) {
    await c.query(
      `insert into public.photos_prospects (prospect_id, contenu, type_mime, maj) values ($1, $2, $3, now())
       on conflict (prospect_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
      [prospectId, photo.contenu, photo.type],
    );
    await c.query("update public.prospects set photo_maj = now() where id = $1", [prospectId]);
  }

  const doublon = await c.query("select id from public.prospects where provider_id = $1 and id <> $2", [profil.providerId, prospectId]);
  if (doublon.rowCount) {
    // Deux fiches pour la même personne (URL différentes) : on ne fusionne pas en silence.
    await c.query("update public.taches set derniere_erreur = $2 where id = $1", [tacheId, `doublon de ${doublon.rows[0].id}`]);
  } else {
    await c.query(
      "update public.prospects set provider_id = $2, public_identifier = coalesce($3, public_identifier), updated_at = now() where id = $1",
      [prospectId, profil.providerId, profil.publicIdentifier],
    );
    // Conversations reçues avant que le prospect soit identifié : rattachées maintenant.
    await rattacherConversations(c, prospectId, profil.providerId);
  }

  const liens: LienLinkedIn[] = [];
  if (profil.distance === "FIRST_DEGREE") liens.push({ type: "relation", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "envoyee") liens.push({ type: "invitation_envoyee", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "recue") liens.push({ type: "invitation_recue", urlNormalisee: url, providerId: profil.providerId });
  await enregistrerLiens(c, liens, "sync");
  await traiterAcceptations(c, await recalculerStatuts(c, { urls: [url], providerIds: [profil.providerId] }));
}

async function effetsListe(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "liste" }>) {
  const { liste, personnes } = d;
  const liens = personnes.map((p) => ({ type: TYPE_LIEN[liste], urlNormalisee: urlDe(p), providerId: p.providerId, date: p.date }));
  await enregistrerLiens(c, liens, "sync");
  const transitions = await recalculerStatuts(c, { urls: liens.map((l) => l.urlNormalisee), providerIds: liens.map((l) => l.providerId) });
  await traiterAcceptations(c, transitions);
  for (const p of personnes) await identifierProspect(c, p, d.photos.get(p.providerId) ?? null, liste);
  await c.query(
    "insert into public.sync_runs (type, fin, nb_elements, statut) values ($1, now(), $2, 'succes')",
    [liste, personnes.length],
  );
  if (d.payload.complete) await pageSuivante(c, tacheId, d);
}

/**
 * Personne vue sur LinkedIn (liste ou webhook d'acceptation) : le prospect de même URL reçoit son
 * identifiant LinkedIn et sa photo, ses conversations lui sont rattachées et sa lecture de profil de
 * fond devient inutile (annulée). La liste des invitations ne donne pas l'URL : on y rapproche par le
 * nom, parmi les seuls prospects dont l'invitation est en attente, et seulement s'il est unique.
 * Un interlocuteur hors CRM de même identifiant reçoit sa photo.
 */
export async function identifierProspect(c: PoolClient, p: PersonneListee, photo: Photo | null, liste: Liste | "webhook") {
  const url = p.publicIdentifier ? identifiantVersProfil(p.publicIdentifier)?.urlNormalisee : null;
  const r = await c.query(
    "select id, provider_id from public.prospects where not demo and (provider_id = $1 or ($2::text is not null and url_normalisee = $2)) order by (provider_id = $1) desc nulls last limit 1",
    [p.providerId, url ?? null],
  );
  let prospect = r.rows[0] as { id: string; provider_id: string | null } | undefined;
  if (!prospect && liste === "invitations_envoyees" && p.nom) {
    const id = await prospectDuMemeNom(c, p.nom, p.providerId, "en_attente");
    if (id) prospect = { id, provider_id: null };
  }
  if (prospect && (!prospect.provider_id || prospect.provider_id === p.providerId)) {
    const pris = await c.query("select 1 from public.prospects where provider_id = $1 and id <> $2", [p.providerId, prospect.id]);
    if (!pris.rowCount) {
      await c.query(
        "update public.prospects set provider_id = $2, public_identifier = coalesce(public_identifier, $3), updated_at = now() where id = $1",
        [prospect.id, p.providerId, p.publicIdentifier],
      );
      await rattacherConversations(c, prospect.id, p.providerId);
      // Lecture de fond devenue inutile (pas celles d'identification d'une conversation).
      await c.query(
        `update public.taches set statut = 'annulee', derniere_erreur = 'identifié par la liste'
          where prospect_id = $1 and type_action = 'lecture_profil' and statut = 'en_attente' and not (payload ? 'conversation_id')`,
        [prospect.id],
      );
    }
    if (photo) {
      await c.query(
        `insert into public.photos_prospects (prospect_id, contenu, type_mime, maj) values ($1, $2, $3, now())
         on conflict (prospect_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
        [prospect.id, photo.contenu, photo.type],
      );
      await c.query("update public.prospects set photo_maj = now() where id = $1", [prospect.id]);
    }
  }
  if (photo) {
    const convs = await c.query(
      "select id from public.conversations where prospect_id is null and photo_maj is null and interlocuteur_provider_id = $1",
      [p.providerId],
    );
    for (const conv of convs.rows) {
      await c.query(
        `insert into public.photos_conversations (conversation_id, contenu, type_mime, maj) values ($1, $2, $3, now())
         on conflict (conversation_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
        [conv.id, photo.contenu, photo.type],
      );
      await c.query("update public.conversations set photo_maj = now(), interlocuteur_public_identifier = coalesce(interlocuteur_public_identifier, $2) where id = $1", [
        conv.id,
        p.publicIdentifier,
      ]);
    }
  }
}

/**
 * Parcours complet : page suivante mise en file, sauf si plus rien n'est à apprendre. Pour les
 * relations (des milliers), on s'arrête dès que tous les prospects en relation sont identifiés ;
 * les invitations (quelques pages) sont toujours lues jusqu'au bout.
 */
async function pageSuivante(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "liste" }>) {
  const lue = await c.query("select max(created_at) as quand from public.actions where tache_id = $1", [tacheId]);
  const lueA: Date = lue.rows[0]?.quand ?? new Date();
  const debut = d.payload.debut ? new Date(d.payload.debut) : lueA;
  const page = (d.payload.page ?? 1) + 1;
  if (page > PAGES_MAX) return;
  if (!d.personnes.length) return finParcours(c, d.liste, debut);
  const premier = d.personnes[0]!.providerId;
  if (d.payload.premier === premier) return; // même page qu'avant : le décalage n'est pas pris en compte
  // Suite : curseur d'Unipile ; à défaut, page pleine → décalage.
  const suite: { curseur?: string; offset?: number } | null = d.suivant
    ? { curseur: d.suivant }
    : d.personnes.length >= d.payload.limite
      ? { offset: (d.payload.offset ?? 0) + d.personnes.length }
      : null;
  if (!suite) return finParcours(c, d.liste, debut);
  if (d.liste === "relations") {
    const reste = await c.query(
      "select 1 from public.prospects where not demo and statut_relation = 'en_relation' and provider_id is null limit 1",
    );
    if (!reste.rowCount) return;
  }
  const jour = new Date().toISOString().slice(0, 10);
  const cle = suite.curseur ? createHash("sha256").update(suite.curseur).digest("hex").slice(0, 32) : `offset-${suite.offset}`;
  await c.query(
    `insert into public.taches (type_action, payload, cle_idempotence, executer_apres)
     values ('lecture_liste', $1, $2, $3::timestamptz + $4 * interval '1 millisecond')
     on conflict (cle_idempotence) do nothing`,
    [
      { liste: d.liste, limite: d.payload.limite, ...suite, premier, complete: true, page, debut: debut.toISOString() },
      `complete:${d.liste}:${jour}:${cle}`,
      lueA,
      ESPACEMENT_PAGES_MS,
    ],
  );
}

/**
 * Liste des invitations envoyées lue en entier : une invitation qu'on y attendait et qui n'y est
 * plus a été retirée, a expiré ou a été acceptée. On ne conclut que pour un prospect dont
 * l'identifiant LinkedIn est connu (la liste donne toujours l'identifiant) : ses liens d'invitation
 * sont effacés et son statut recalculé ; s'il n'est pas en relation, il revient « à inviter » et son
 * étape « Invitation envoyée » repasse à « À contacter ». Un prospect non identifié reste en attente.
 */
async function finParcours(c: PoolClient, liste: Liste, debut: Date) {
  if (liste !== "invitations_envoyees") return;
  const disparues = await c.query(
    `select p.id, p.url_normalisee, p.provider_id from public.prospects p
      where not p.demo and p.statut_relation = 'en_attente' and p.provider_id is not null
        and not exists (select 1 from public.liens_linkedin l
                         where l.type = 'invitation_envoyee' and l.vu_le >= $1
                           and (l.url_normalisee = p.url_normalisee or l.provider_id = p.provider_id))`,
    [debut],
  );
  if (!disparues.rowCount) return;
  const urls = disparues.rows.map((x) => x.url_normalisee as string);
  const ids = disparues.rows.map((x) => x.provider_id as string);
  await c.query(
    "delete from public.liens_linkedin where type = 'invitation_envoyee' and (url_normalisee = any($1) or provider_id = any($2))",
    [urls, ids],
  );
  const transitions = await recalculerStatuts(c, { urls, providerIds: ids });
  await traiterAcceptations(c, transitions);
  const retour = transitions.filter((t) => t.avant === "en_attente" && t.apres === "a_inviter").map((t) => t.prospectId);
  if (!retour.length) return;
  const maj = await c.query(
    "update public.prospects set etape = 'a_contacter', updated_at = now() where id = any($1) and etape = 'invitation_envoyee' returning id",
    [retour],
  );
  for (const r of maj.rows) {
    await c.query(
      `insert into public.actions (prospect_id, type, sortante, resultat, details)
       values ($1, 'changement_etape', false, 'succes', '{"vers": "a_contacter", "cause": "invitation_disparue"}')`,
      [r.id],
    );
  }
}

/** Message parti : il rejoint le fil de la conversation, à l'heure de l'envoi. */
async function effetsMessage(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "message" }>) {
  const a = await c.query("select created_at from public.actions where tache_id = $1 order by created_at desc limit 1", [tacheId]);
  const quand: Date = a.rows[0]?.created_at ?? new Date();
  await c.query(
    `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at)
     values ($1, $2, 'sortant', $3, $4) on conflict (unipile_message_id) do nothing`,
    [d.conversationId, d.messageId, d.texte, quand],
  );
  await c.query(
    "update public.conversations set dernier_message_at = greatest(coalesce(dernier_message_at, $2), $2) where id = $1",
    [d.conversationId, quand],
  );
}

/**
 * Conversation démarrée : rattachée au prospect avec le premier message. Une conversation reprise
 * de l'archive LinkedIn (sans chat Unipile) est reliée à ce chat plutôt que dupliquée.
 */
async function effetsConversation(c: PoolClient, tacheId: string, d: Extract<Donnees, { genre: "conversation" }>) {
  const reliee = await c.query(
    `update public.conversations set unipile_chat_id = $1, interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $3)
      where id = (select id from public.conversations where prospect_id = $2 and unipile_chat_id is null
                   order by dernier_message_at desc nulls last limit 1)
        and not exists (select 1 from public.conversations where unipile_chat_id = $1)
      returning id`,
    [d.chatId, d.prospectId, d.providerId],
  );
  if (reliee.rowCount) {
    await effetsMessage(c, tacheId, { genre: "message", conversationId: reliee.rows[0].id, texte: d.texte, messageId: d.messageId });
    return;
  }
  const conv = await c.query(
    `insert into public.conversations (unipile_chat_id, prospect_id, interlocuteur_provider_id, demo)
     select $1, p.id, $3, coalesce(p.demo, false)
       from (select 1) x left join public.prospects p on p.id = $2
     on conflict (unipile_chat_id) do update
       set prospect_id = coalesce(public.conversations.prospect_id, excluded.prospect_id)
     returning id`,
    [d.chatId, d.prospectId, d.providerId],
  );
  await effetsMessage(c, tacheId, { genre: "message", conversationId: conv.rows[0].id, texte: d.texte, messageId: d.messageId });
}

/**
 * Interlocuteur d'une conversation hors CRM identifié : prospect retrouvé par l'URL (ou l'identifiant
 * LinkedIn) → conversation rattachée, identifiant et photo enregistrés, sa propre lecture de profil
 * retirée de la file ; sinon, identité gardée sur la conversation (nom, poste, URL, photo).
 */
async function effetsIdentification(c: PoolClient, conversationId: string, profil: ProfilLu, photo: Photo | null) {
  const conv = await c.query(
    "select id, prospect_id, interlocuteur_provider_id, rattachement_par_nom from public.conversations where id = $1",
    [conversationId],
  );
  if (!conv.rowCount) return; // supprimée entre-temps
  const url = profil.publicIdentifier ? identifiantVersProfil(profil.publicIdentifier)?.urlNormalisee : null;
  const prospect = await c.query(
    "select id from public.prospects where ($1::text is not null and url_normalisee = $1) or provider_id = $2 order by provider_id is not null desc limit 1",
    [url ?? null, profil.providerId],
  );
  const p = prospect.rows[0] as { id: string } | undefined;
  const actuel = conv.rows[0] as { prospect_id: string | null; rattachement_par_nom: boolean };
  // Rattachement provisoire par le nom démenti par l'URL : la conversation est détachée (ou réattribuée).
  if (actuel.prospect_id && actuel.rattachement_par_nom && actuel.prospect_id !== p?.id) {
    await c.query("update public.conversations set prospect_id = null, rattachement_par_nom = false where id = $1", [conversationId]);
    actuel.prospect_id = null;
  }
  if (p && (!actuel.prospect_id || actuel.prospect_id === p.id)) {
    const libre = await c.query("select 1 from public.prospects where provider_id = $1 and id <> $2", [profil.providerId, p.id]);
    if (!libre.rowCount) {
      await c.query(
        "update public.prospects set provider_id = coalesce(provider_id, $2), public_identifier = coalesce(public_identifier, $3), updated_at = now() where id = $1",
        [p.id, profil.providerId, profil.publicIdentifier],
      );
    }
    if (photo) {
      await c.query(
        `insert into public.photos_prospects (prospect_id, contenu, type_mime, maj) values ($1, $2, $3, now())
         on conflict (prospect_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
        [p.id, photo.contenu, photo.type],
      );
      await c.query("update public.prospects set photo_maj = now() where id = $1", [p.id]);
    }
    // Sa lecture de profil, devenue inutile, quitte la file.
    await c.query(
      "update public.taches set statut = 'annulee', updated_at = now() where prospect_id = $1 and type_action = 'lecture_profil' and statut = 'en_attente'",
      [p.id],
    );
    await rattacherConversations(c, p.id, conv.rows[0].interlocuteur_provider_id ?? profil.providerId);
    await c.query("update public.conversations set prospect_id = $1, rattachement_par_nom = false where id = $2", [p.id, conversationId]);
    return;
  }
  const nom = [profil.prenom, profil.nom].filter(Boolean).join(" ").slice(0, 200) || null;
  await c.query(
    `update public.conversations
        set interlocuteur_nom = coalesce($2, interlocuteur_nom), interlocuteur_titre = $3,
            interlocuteur_public_identifier = $4, interlocuteur_provider_id = coalesce(interlocuteur_provider_id, $5)
      where id = $1`,
    [conversationId, nom, profil.titre?.slice(0, 300) ?? null, profil.publicIdentifier?.slice(0, 100) ?? null, profil.providerId],
  );
  if (photo) {
    await c.query(
      `insert into public.photos_conversations (conversation_id, contenu, type_mime, maj) values ($1, $2, $3, now())
       on conflict (conversation_id) do update set contenu = excluded.contenu, type_mime = excluded.type_mime, maj = now()`,
      [conversationId, photo.contenu, photo.type],
    );
    await c.query("update public.conversations set photo_maj = now() where id = $1", [conversationId]);
  }
}

export const appliquerEffetsUnipile: AppliquerEffets = async (c, tache, donnees) => {
  const d = donnees as Donnees;
  if (d.genre === "message") return effetsMessage(c, tache.id, d);
  if (d.genre === "conversation") return effetsConversation(c, tache.id, d);
  if (d.genre === "profil" && d.conversationId && !tache.prospectId) await effetsIdentification(c, d.conversationId, d.profil, d.photo);
  else if (d.genre === "profil") await effetsProfil(c, tache.prospectId, tache.id, d.profil, d.photo);
  else if (d.genre === "liste") await effetsListe(c, tache.id, d);
};
