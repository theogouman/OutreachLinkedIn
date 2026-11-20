import type { Pool } from "pg";
import { partiesLocales, prochainDebutPlage, type Plages } from "./temps";

/**
 * Synchronisation des statuts par listes : une lecture par liste et par jour,
 * à une heure aléatoire dans les plages autorisées (recommandation Unipile :
 * jamais à heure fixe ni en boucle). Passe par la file, sous le quota
 * « lecture_liste ». La clé d'idempotence garantit une seule tâche par liste et par jour.
 */
export const LISTES = ["relations", "invitations_envoyees", "invitations_recues"] as const;

/**
 * Taille lue chaque jour. Les invitations envoyées sont lues en entier (une page de 500, le maximum
 * d'Unipile) : les plus anciennes, celles qu'une automatisation retire, ont besoin de leur identifiant,
 * et une liste lue en entier permet de constater chaque jour les invitations disparues.
 */
const LIMITE_JOUR: Record<(typeof LISTES)[number], number> = { relations: 50, invitations_envoyees: 500, invitations_recues: 50 };

/** Fenêtre de tirage après le début de plage, pour étaler les lectures. */
const FENETRE_MS = 4 * 60 * 60 * 1000;

export async function planifierSynchronisations(pool: Pool, maintenant: Date, aleatoire: () => number = Math.random) {
  const reg = await pool.query("select fuseau, plages from public.reglages where id");
  const fuseau: string = reg.rows[0].fuseau;
  const plages: Plages = reg.rows[0].plages;

  const debut = prochainDebutPlage(maintenant, plages, fuseau);
  if (!debut) return 0;
  const jour = partiesLocales(debut, fuseau);
  const cleJour = `${jour.annee}-${String(jour.mois).padStart(2, "0")}-${String(jour.jour).padStart(2, "0")}`;

  let creees = 0;
  for (const liste of LISTES) {
    const tirage = new Date(debut.getTime() + aleatoire() * FENETRE_MS);
    const quand = prochainDebutPlage(tirage, plages, fuseau) ?? debut;
    const r = await pool.query(
      `insert into public.taches (type_action, payload, cle_idempotence, executer_apres)
       values ('lecture_liste', $1, $2, $3)
       on conflict (cle_idempotence) do nothing`,
      [{ liste, limite: LIMITE_JOUR[liste] }, `sync:${liste}:${cleJour}`, quand],
    );
    creees += r.rowCount ?? 0;
  }
  return creees;
}
