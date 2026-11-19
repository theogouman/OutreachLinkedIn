import type { Pool } from "pg";
import { z } from "zod";
import { OPTIONS_VUE, MISES_EN_PAGE, optionsAffichables, typeVue, type Vue } from "@/lib/vues/catalogue";
import { EnvoiRefuse } from "@/server/mutations";

/*
 * Vues enregistrées de la liste Prospects. Écriture par le serveur seulement (actions vérifiées
 * par exigerUtilisateur), entrées validées par Zod, réglages revalidés par le schéma du type.
 */

const VUES_MAX = 20;
const nomVue = z
  .string()
  .transform((t) => t.trim())
  .pipe(z.string().min(1, "Nom de vue vide").max(60, "Nom de vue trop long (60 caractères au plus)"));

export async function vuesDepuis(pool: Pool): Promise<Vue[]> {
  const r = await pool.query("select id, nom, type, options from public.vues where liste = 'prospects' order by ordre, created_at");
  return r.rows.flatMap((x) => {
    const t = typeVue.safeParse(x.type);
    return t.success ? [{ id: x.id, nom: x.nom, type: t.data, options: optionsAffichables(t.data, x.options) }] : [];
  });
}

export const creationVueSchema = z.object({ nom: nomVue, type: typeVue });

export async function creerVue(pool: Pool, entree: unknown): Promise<string> {
  const v = creationVueSchema.parse(entree);
  const n = await pool.query("select count(*)::int as n, coalesce(max(ordre), -1) + 1 as suivant from public.vues where liste = 'prospects'");
  if (n.rows[0].n >= VUES_MAX) throw new EnvoiRefuse(`${VUES_MAX} vues au plus.`);
  const r = await pool.query(
    "insert into public.vues (liste, nom, type, options, ordre) values ('prospects', $1, $2, $3, $4) returning id",
    [v.nom, v.type, MISES_EN_PAGE[v.type].defaut, n.rows[0].suivant],
  );
  return r.rows[0].id;
}

export const renommageVueSchema = z.object({ id: z.uuid(), nom: nomVue });

export async function renommerVue(pool: Pool, entree: unknown) {
  const v = renommageVueSchema.parse(entree);
  const r = await pool.query("update public.vues set nom = $2 where id = $1 and liste = 'prospects'", [v.id, v.nom]);
  if (!r.rowCount) throw new EnvoiRefuse("Vue introuvable.");
}

export async function supprimerVue(pool: Pool, id: unknown) {
  const vueId = z.uuid().parse(id);
  const n = await pool.query("select count(*)::int as n from public.vues where liste = 'prospects'");
  if (n.rows[0].n <= 1) throw new EnvoiRefuse("Il faut garder au moins une vue.");
  const r = await pool.query("delete from public.vues where id = $1 and liste = 'prospects'", [vueId]);
  if (!r.rowCount) throw new EnvoiRefuse("Vue introuvable.");
}

export const optionsVueSchema = z.object({ id: z.uuid(), options: z.unknown() });

/** Réglages d'une vue, validés par le schéma de son type (propriétés connues seulement). */
export async function majOptionsVue(pool: Pool, entree: unknown) {
  const e = optionsVueSchema.parse(entree);
  const v = await pool.query("select type from public.vues where id = $1 and liste = 'prospects'", [e.id]);
  if (!v.rowCount) throw new EnvoiRefuse("Vue introuvable.");
  const type = typeVue.parse(v.rows[0].type);
  const options = OPTIONS_VUE[type].parse(e.options);
  await pool.query("update public.vues set options = $2 where id = $1", [e.id, options]);
}
