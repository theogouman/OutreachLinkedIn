import type { Pool, PoolClient } from "pg";

/**
 * Données de démonstration (personnes et entreprises fictives). Marquées `demo` :
 * le client Unipile simulé ne traite qu'elles, et purgerDemo() les efface toutes,
 * historique et compteurs de quotas compris, avant le passage en réel.
 */

type Etat = {
  id: string;
  prenom: string;
  nom: string;
  poste: string;
  entreprise: string;
  liste: string;
  statut: "en_relation" | "en_attente" | "invitation_recue" | "a_inviter";
  etape: string;
  relance?: number; // jours par rapport à aujourd'hui
  lu?: boolean; // provider_id déjà connu
};

const SALON = "Démo · Salon SaaS Paris";
const NOTION = "Démo · Utilisateurs Notion";
const FONDATEURS = "Démo · Fondateurs B2B";

export const PROSPECTS_DEMO: Etat[] = [
  { id: "demo-claire-martin", prenom: "Claire", nom: "Martin", poste: "Head of Operations", entreprise: "Atelier Nova", liste: NOTION, statut: "en_relation", etape: "rdv_fixe", lu: true },
  { id: "demo-julien-bernard", prenom: "Julien", nom: "Bernard", poste: "CEO", entreprise: "Studio Lumen", liste: FONDATEURS, statut: "en_relation", etape: "gagne", lu: true },
  { id: "demo-sophie-dubois", prenom: "Sophie", nom: "Dubois", poste: "COO", entreprise: "Brique & Co", liste: SALON, statut: "en_relation", etape: "repondu", lu: true },
  { id: "demo-thomas-petit", prenom: "Thomas", nom: "Petit", poste: "Directeur commercial", entreprise: "Kairos Conseil", liste: SALON, statut: "en_relation", etape: "relance_1", relance: -1, lu: true },
  { id: "demo-lea-moreau", prenom: "Léa", nom: "Moreau", poste: "Product Manager", entreprise: "Orbe Logiciels", liste: NOTION, statut: "en_relation", etape: "premier_message", relance: 2, lu: true },
  { id: "demo-antoine-girard", prenom: "Antoine", nom: "Girard", poste: "Fondateur", entreprise: "Pivot Labs", liste: FONDATEURS, statut: "en_relation", etape: "connecte", lu: true },
  { id: "demo-manon-laurent", prenom: "Manon", nom: "Laurent", poste: "Responsable RevOps", entreprise: "Cap Horizon", liste: SALON, statut: "en_relation", etape: "relance_2", relance: 0, lu: true },
  { id: "demo-nicolas-simon", prenom: "Nicolas", nom: "Simon", poste: "CTO", entreprise: "Datagrove", liste: FONDATEURS, statut: "en_relation", etape: "perdu", lu: true },
  { id: "demo-camille-roux", prenom: "Camille", nom: "Roux", poste: "Office Manager", entreprise: "Maison Verde", liste: NOTION, statut: "en_attente", etape: "invitation_envoyee", lu: true },
  { id: "demo-hugo-lefevre", prenom: "Hugo", nom: "Lefèvre", poste: "Head of Growth", entreprise: "Fennec Analytics", liste: SALON, statut: "en_attente", etape: "invitation_envoyee", lu: true },
  { id: "demo-ines-mercier", prenom: "Inès", nom: "Mercier", poste: "Directrice des opérations", entreprise: "Alto Immobilier", liste: NOTION, statut: "en_attente", etape: "invitation_envoyee", lu: true },
  { id: "demo-lucas-fontaine", prenom: "Lucas", nom: "Fontaine", poste: "Fondateur", entreprise: "Rivage Studio", liste: FONDATEURS, statut: "en_attente", etape: "invitation_envoyee", lu: true },
  { id: "demo-chloe-garnier", prenom: "Chloé", nom: "Garnier", poste: "Chief of Staff", entreprise: "Opale Finance", liste: SALON, statut: "en_attente", etape: "invitation_envoyee", lu: true },
  { id: "demo-mathis-chevalier", prenom: "Mathis", nom: "Chevalier", poste: "Consultant Notion", entreprise: "Indépendant", liste: NOTION, statut: "invitation_recue", etape: "a_contacter", lu: true },
  { id: "demo-sarah-boyer", prenom: "Sarah", nom: "Boyer", poste: "Responsable Marketing", entreprise: "Sillage", liste: SALON, statut: "invitation_recue", etape: "a_contacter", lu: true },
  { id: "demo-paul-renard", prenom: "Paul", nom: "Renard", poste: "Directeur général", entreprise: "Granit Industrie", liste: FONDATEURS, statut: "a_inviter", etape: "a_contacter", lu: true },
  { id: "demo-emma-lambert", prenom: "Emma", nom: "Lambert", poste: "Operations Lead", entreprise: "Coton Bleu", liste: NOTION, statut: "a_inviter", etape: "a_contacter", lu: true },
  { id: "demo-louis-bonnet", prenom: "Louis", nom: "Bonnet", poste: "Head of Sales", entreprise: "Voltige", liste: SALON, statut: "a_inviter", etape: "a_contacter", lu: true },
  { id: "demo-jade-francois", prenom: "Jade", nom: "François", poste: "Fondatrice", entreprise: "Mosaïque RH", liste: FONDATEURS, statut: "a_inviter", etape: "a_contacter", lu: true },
  { id: "demo-gabriel-rousseau", prenom: "Gabriel", nom: "Rousseau", poste: "COO", entreprise: "Nord Logistique", liste: SALON, statut: "a_inviter", etape: "pas_interesse", lu: true },
  { id: "demo-alice-vincent", prenom: "Alice", nom: "Vincent", poste: "Directrice administrative", entreprise: "Cèdre Avocats", liste: NOTION, statut: "a_inviter", etape: "a_contacter" },
  { id: "demo-arthur-muller", prenom: "Arthur", nom: "Muller", poste: "Fondateur", entreprise: "Basalte", liste: FONDATEURS, statut: "a_inviter", etape: "a_contacter" },
  { id: "demo-zoe-lefebvre", prenom: "Zoé", nom: "Lefebvre", poste: "Customer Success Manager", entreprise: "Prisme", liste: SALON, statut: "a_inviter", etape: "a_contacter" },
  { id: "demo-raphael-andre", prenom: "Raphaël", nom: "André", poste: "Head of Product", entreprise: "Lagune", liste: NOTION, statut: "en_relation", etape: "premier_message", relance: 1, lu: true },
];

/** Invitations « acceptées » à la prochaine synchronisation simulée. */
export const ACCEPTEES_DEMO = ["demo-camille-roux", "demo-hugo-lefevre"];

export const providerDemo = (id: string) => `ACoDEMO${id.slice(5).replace(/-/g, "").slice(0, 20)}`;

const JOUR = 24 * 60 * 60 * 1000;

export class DemoDejaChargee extends Error {}

async function journal(
  c: PoolClient,
  prospectId: string,
  type: string,
  quand: Date,
  extra: { avecNote?: boolean; details?: Record<string, unknown> } = {},
) {
  const sortante = ["invitation", "message", "lecture_profil", "lecture_liste"].includes(type);
  await c.query(
    `insert into public.actions (prospect_id, type, sortante, avec_note, resultat, details, created_at)
     values ($1, $2, $3, $4, 'succes', $5, $6)`,
    [prospectId, type, sortante, extra.avecNote ?? false, extra.details ?? {}, quand],
  );
}

export async function semerDemo(pool: Pool, maintenant = new Date()) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const deja = await c.query("select 1 from public.prospects where demo limit 1");
    if (deja.rowCount) throw new DemoDejaChargee("Les données de démonstration sont déjà chargées.");

    const ids = new Map<string, string>();
    const jour = (n: number) => new Date(maintenant.getTime() + n * JOUR);
    const date = (n: number) => jour(n).toISOString().slice(0, 10);

    for (const [i, p] of PROSPECTS_DEMO.entries()) {
      const r = await c.query(
        `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, provider_id, prenom, nom, poste,
                                       entreprise, liste_origine, statut_relation, etape, prochaine_relance, demo, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13) returning id`,
        [
          `https://www.linkedin.com/in/${p.id}`,
          `linkedin.com/in/${p.id}`,
          p.id,
          p.lu ? providerDemo(p.id) : null,
          p.prenom,
          p.nom,
          p.poste,
          p.entreprise,
          p.liste,
          p.statut,
          p.etape,
          p.relance === undefined ? null : date(p.relance),
          jour(-21 + (i % 5)),
        ],
      );
      const pid = r.rows[0].id as string;
      ids.set(p.id, pid);

      const lien =
        p.statut === "en_relation" ? "relation" : p.statut === "en_attente" ? "invitation_envoyee" : p.statut === "invitation_recue" ? "invitation_recue" : null;
      if (lien) {
        await c.query(
          `insert into public.liens_linkedin (type, url_normalisee, provider_id, date_lien, source)
           values ($1, $2, $3, $4, 'sync') on conflict do nothing`,
          [lien, `linkedin.com/in/${p.id}`, providerDemo(p.id), jour(-10 + (i % 7))],
        );
      }

      // Historique plausible, selon l'avancement.
      if (p.lu) await journal(c, pid, "lecture_profil", jour(-20 + (i % 4)));
      if (p.statut === "en_relation" || p.statut === "en_attente") {
        await journal(c, pid, "invitation", jour(p.statut === "en_attente" ? -2 - (i % 3) : -16 + (i % 4)), { avecNote: i % 6 === 0 });
      }
      if (p.statut === "en_relation") {
        await journal(c, pid, "acceptation", jour(-12 + (i % 3)));
        await journal(c, pid, "changement_etape", jour(-12 + (i % 3)), { details: { vers: "connecte", cause: "acceptation" } });
        if (!["connecte", "perdu"].includes(p.etape)) await journal(c, pid, "message", jour(-9 + (i % 3)));
        if (["relance_1", "relance_2", "repondu", "rdv_fixe", "gagne"].includes(p.etape)) await journal(c, pid, "message", jour(-5 + (i % 2)));
        if (["repondu", "rdv_fixe", "gagne"].includes(p.etape)) await journal(c, pid, "reponse", jour(-3 + (i % 2)));
        if (p.etape !== "connecte") {
          await journal(c, pid, "changement_etape", jour(-2), { details: { vers: p.etape } });
        }
      }
    }

    // Activité du jour, pour que la jauge de quotas ait du relief.
    const aujourdhui = new Date(maintenant.getTime() - 60 * 60 * 1000);
    for (const id of ["demo-chloe-garnier", "demo-lucas-fontaine"]) await journal(c, ids.get(id)!, "invitation", aujourdhui);
    for (const id of ["demo-paul-renard", "demo-emma-lambert", "demo-louis-bonnet", "demo-jade-francois", "demo-gabriel-rousseau", "demo-raphael-andre"]) {
      await journal(c, ids.get(id)!, "lecture_profil", aujourdhui);
    }
    await journal(c, ids.get("demo-thomas-petit")!, "message", aujourdhui);

    // File d'attente : trois lectures de profil (traitées par le client simulé) ...
    for (const id of ["demo-alice-vincent", "demo-arthur-muller", "demo-zoe-lefebvre"]) {
      await c.query(
        `insert into public.taches (type_action, prospect_id, payload, cle_idempotence)
         values ('lecture_profil', $1, $2, $3)`,
        [ids.get(id), { public_identifier: id }, `lecture_profil:${ids.get(id)}`],
      );
    }
    // ... et un envoi incertain, pour essayer la décision manuelle.
    await c.query(
      `insert into public.taches (type_action, prospect_id, payload, cle_idempotence, statut, motif_attente, derniere_erreur, tentatives)
       values ('message', $1, $2, $3, 'incertaine', 'incertaine', '504 provider/timeout', 1)`,
      [ids.get("demo-lea-moreau"), { texte: "Bonjour Léa, merci pour l'acceptation ! …" }, `demo:message:${ids.get("demo-lea-moreau")}`],
    );

    await c.query("commit");
    return { prospects: PROSPECTS_DEMO.length };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Efface toutes les données de démonstration (prospects, historique, file, liens). */
export async function purgerDemo(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    // Journal d'abord : sinon prospect_id passerait à NULL et les actions resteraient
    // dans les compteurs de quotas.
    await c.query("delete from public.actions where prospect_id in (select id from public.prospects where demo)");
    const p = await c.query("delete from public.prospects where demo");
    await c.query(
      "delete from public.liens_linkedin where url_normalisee like 'linkedin.com/in/demo-%' or provider_id like 'ACoDEMO%'",
    );
    await c.query("commit");
    return { prospects: p.rowCount ?? 0 };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
