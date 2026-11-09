import { z } from "zod";
import { correspondTexte } from "@/lib/recherche";
import type { DefinitionFiltre } from "./definition";

const oui = z.literal("oui").optional();

/** Filtres de l'Inbox (combinables), validés côté serveur et partagés avec le navigateur. */
export const filtresInboxSchema = z.object({
  nonLus: oui,
  aTraiter: oui,
  horsCrm: oui,
  recherche: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type FiltresInbox = z.infer<typeof filtresInboxSchema>;

/** Ce que les règles locales lisent d'une conversation. */
export interface ConversationFiltrable {
  nom: string;
  sousTitre: string | null;
  apercu: string;
  dernierSens: "entrant" | "sortant";
  nonLu: boolean;
  prospectId: string | null;
}

type Def = DefinitionFiltre<ConversationFiltrable, FiltresInbox>;

export const FILTRES_INBOX: readonly Def[] = [
  { cle: "recherche", libelle: "Rechercher", type: "texte", correspond: (c, v) => correspondTexte([c.nom, c.sousTitre, c.apercu], v) },
  { cle: "nonLus", libelle: "Non lues", type: "choix", correspond: (c) => c.nonLu },
  { cle: "aTraiter", libelle: "À traiter", type: "choix", correspond: (c) => c.dernierSens === "entrant" },
  { cle: "horsCrm", libelle: "Hors CRM", type: "choix", correspond: (c) => c.prospectId === null },
];

/** Cases du menu de filtres (la recherche a son propre champ). */
export const CASES_INBOX = FILTRES_INBOX.filter((d) => d.type === "choix").map((d) => ({ cle: d.cle, libelle: d.libelle }));

/** Ancien paramètre d'URL (?filtre=…) : lien direct depuis d'autres pages, appliqué au chargement. */
export function filtresInboxDepuisUrl(filtre: string | undefined): FiltresInbox {
  const correspondance: Record<string, Partial<FiltresInbox>> = {
    non_lus: { nonLus: "oui" },
    a_traiter: { aTraiter: "oui" },
    hors_crm: { horsCrm: "oui" },
  };
  return { page: 1, ...(filtre ? correspondance[filtre] : {}) };
}
