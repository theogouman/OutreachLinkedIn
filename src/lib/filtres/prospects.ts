import { z } from "zod";
import { correspond } from "@/lib/recherche";
import type { DefinitionFiltre } from "./definition";

/** Filtres de la liste des prospects (validés côté serveur, partagés avec le navigateur). */
export const filtresProspectsSchema = z.object({
  statut: z.enum(["en_relation", "en_attente", "invitation_recue", "a_inviter"]).optional(),
  etape: z.string().max(50).optional(),
  liste: z.string().max(100).optional(),
  relanceAvant: z.iso.date().optional(),
  recherche: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type FiltresProspects = z.infer<typeof filtresProspectsSchema>;

/** Ce que les règles locales lisent d'une ligne. */
export interface ProspectFiltrable {
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  entreprise: string | null;
  listeOrigine: string | null;
  statutRelation: string;
  etape: string;
  prochaineRelance: string | null;
}

type Def = DefinitionFiltre<ProspectFiltrable, FiltresProspects>;

export const FILTRES_PROSPECTS: readonly Def[] = [
  { cle: "recherche", libelle: "Rechercher", type: "texte", correspond: (p, v) => correspond(p, v) },
  { cle: "statut", libelle: "Relation", type: "choix", correspond: (p, v) => p.statutRelation === v },
  { cle: "etape", libelle: "Étape", type: "choix", correspond: (p, v) => p.etape === v },
  { cle: "liste", libelle: "Liste", type: "choix", correspond: (p, v) => p.listeOrigine === v },
  {
    cle: "relanceAvant",
    libelle: "Relance avant le",
    type: "date",
    correspond: (p, v) => p.prochaineRelance !== null && p.prochaineRelance <= v,
  },
];

export const FILTRES_PROSPECTS_VIDES: FiltresProspects = { page: 1 };
