import { z } from "zod";
import type { PoolClient } from "pg";
import { identifiantVersProfil } from "@/lib/linkedin-url";
import type { TypeLien } from "@/lib/statut-relation";
import type { AppliquerEffets, ExecuteurLinkedIn, ResultatAppel } from "@/server/queue/worker";
import { enregistrerLiens, recalculerStatuts, traiterAcceptations, type LienLinkedIn } from "@/server/relations";
import type { ClientLinkedIn, Liste, PersonneListee, ProfilLu } from "./types";

const listeSchema = z.enum(["relations", "invitations_envoyees", "invitations_recues"]);
const payloadLectureProfil = z.object({ public_identifier: z.string().min(3).max(100) });
const payloadLectureListe = z.object({ liste: listeSchema, limite: z.number().int().min(1).max(100).default(50) });

type Donnees =
  | { genre: "profil"; profil: ProfilLu }
  | { genre: "liste"; liste: Liste; personnes: PersonneListee[] };

const invalide = (type: string): ResultatAppel => ({ ok: false, erreur: { status: 400, type } });

/** Traduit une tâche de la file en appel LinkedIn. Phase 1 : lectures uniquement. */
export function creerExecuteur(client: ClientLinkedIn): ExecuteurLinkedIn {
  return {
    async executer(tache) {
      if (tache.typeAction === "lecture_profil") {
        const p = payloadLectureProfil.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireProfil(p.data.public_identifier);
        return r.ok ? { ok: true, donnees: { genre: "profil", profil: r.donnees } satisfies Donnees } : r;
      }
      if (tache.typeAction === "lecture_liste") {
        const p = payloadLectureListe.safeParse(tache.payload);
        if (!p.success) return invalide("payload_invalide");
        const r = await client.lireListe(p.data.liste, p.data.limite);
        return r.ok ? { ok: true, donnees: { genre: "liste", liste: p.data.liste, personnes: r.donnees } satisfies Donnees } : r;
      }
      // Invitations et messages : phase 2.
      return invalide("non_disponible_phase_1");
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

async function effetsProfil(c: PoolClient, prospectId: string | null, tacheId: string, profil: ProfilLu) {
  if (!prospectId) return;
  const prospect = await c.query("select url_normalisee from public.prospects where id = $1", [prospectId]);
  if (!prospect.rowCount) return; // supprimé entre-temps
  const url: string = prospect.rows[0].url_normalisee;

  const doublon = await c.query("select id from public.prospects where provider_id = $1 and id <> $2", [profil.providerId, prospectId]);
  if (doublon.rowCount) {
    // Deux fiches pour la même personne (URL différentes) : on ne fusionne pas en silence.
    await c.query("update public.taches set derniere_erreur = $2 where id = $1", [tacheId, `doublon de ${doublon.rows[0].id}`]);
  } else {
    await c.query(
      "update public.prospects set provider_id = $2, public_identifier = coalesce($3, public_identifier), updated_at = now() where id = $1",
      [prospectId, profil.providerId, profil.publicIdentifier],
    );
  }

  const liens: LienLinkedIn[] = [];
  if (profil.distance === "FIRST_DEGREE") liens.push({ type: "relation", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "envoyee") liens.push({ type: "invitation_envoyee", urlNormalisee: url, providerId: profil.providerId });
  if (profil.invitation === "recue") liens.push({ type: "invitation_recue", urlNormalisee: url, providerId: profil.providerId });
  await enregistrerLiens(c, liens, "sync");
  await traiterAcceptations(c, await recalculerStatuts(c, { urls: [url], providerIds: [profil.providerId] }));
}

async function effetsListe(c: PoolClient, liste: Liste, personnes: PersonneListee[]) {
  const liens = personnes.map((p) => ({ type: TYPE_LIEN[liste], urlNormalisee: urlDe(p), providerId: p.providerId, date: p.date }));
  await enregistrerLiens(c, liens, "sync");
  const transitions = await recalculerStatuts(c, { urls: liens.map((l) => l.urlNormalisee), providerIds: liens.map((l) => l.providerId) });
  await traiterAcceptations(c, transitions);
  await c.query(
    "insert into public.sync_runs (type, fin, nb_elements, statut) values ($1, now(), $2, 'succes')",
    [liste, personnes.length],
  );
}

export const appliquerEffetsUnipile: AppliquerEffets = async (c, tache, donnees) => {
  const d = donnees as Donnees;
  if (d.genre === "profil") await effetsProfil(c, tache.prospectId, tache.id, d.profil);
  else if (d.genre === "liste") await effetsListe(c, d.liste, d.personnes);
};
