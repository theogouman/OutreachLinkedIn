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


type Msg = ["entrant" | "sortant", number, string]; // sens, jours avant aujourd'hui (décimal), texte

/** Conversations fictives, rattachées aux prospects de démo (clé = identifiant public). */
export const CONVERSATIONS_DEMO: Record<string, { nonLu?: boolean; messages: Msg[] }> = {
  "demo-lea-moreau": {
    messages: [
      ["sortant", 8.9, "Bonjour Léa, merci d'avoir accepté l'invitation ! J'ai vu qu'Orbe Logiciels venait de passer à 40 personnes : c'est souvent le moment où la doc produit se disperse entre Notion, Drive et Slack. Comment vous vous organisez aujourd'hui ?"],
    ],
  },
  "demo-raphael-andre": {
    messages: [
      ["sortant", 7.8, "Bonjour Raphaël, ravi d'être connecté. Je travaille avec des équipes produit qui veulent un vrai espace Notion de référence (roadmap, specs, décisions). C'est un sujet chez Lagune en ce moment ?"],
    ],
  },
  "demo-thomas-petit": {
    messages: [
      ["sortant", 9.1, "Bonjour Thomas, merci pour la connexion. Chez Kairos Conseil, le suivi des missions est centralisé ou chaque consultant a ses propres outils ?"],
      ["sortant", 4.2, "Je me permets de revenir vers vous : j'ai publié un modèle Notion de suivi de missions pour cabinets de conseil, je peux vous l'envoyer si ça vous parle."],
    ],
  },
  "demo-manon-laurent": {
    messages: [
      ["sortant", 12.0, "Bonjour Manon, merci d'avoir accepté. En RevOps, vous partez plutôt sur un CRM classique ou vous avez déjà regardé Notion pour le pipe ?"],
      ["sortant", 7.9, "Petite relance : je viens d'accompagner une équipe de 15 commerciaux sur ce sujet, je peux vous partager ce qu'on a mis en place."],
      ["sortant", 0.9, "Dernier message de ma part, promis ! Si le sujet revient sur la table, je reste disponible pour un échange de 20 minutes."],
    ],
  },
  "demo-sophie-dubois": {
    nonLu: true,
    messages: [
      ["sortant", 9.0, "Bonjour Sophie, merci pour la connexion ! Chez Brique & Co, les process d'onboarding des chantiers sont documentés quelque part ?"],
      ["sortant", 5.1, "Je reviens vers vous avec un exemple concret : un wiki chantier sous Notion qui a divisé par deux les questions des nouveaux conducteurs de travaux."],
      ["entrant", 0.2, "Bonjour, oui c'est un vrai sujet chez nous en ce moment, on a tout dans des PDF. Vous intervenez comment concrètement ? Et c'est quel budget en général ?"],
    ],
  },
  "demo-claire-martin": {
    messages: [
      ["sortant", 11.2, "Bonjour Claire, merci d'avoir accepté. J'ai vu que vous étiez sur Notion chez Atelier Nova : vous l'utilisez pour toute l'équipe ou juste les ops ?"],
      ["entrant", 9.7, "Bonjour ! Pour toute l'équipe en théorie, mais en pratique c'est un peu le bazar, personne ne retrouve rien."],
      ["sortant", 9.5, "Classique quand l'espace grandit sans structure. On pourrait en parler 30 minutes ? Je vous montre comment d'autres agences s'y prennent."],
      ["entrant", 8.1, "Avec plaisir. Jeudi 14h ça vous irait ?"],
      ["sortant", 8.0, "Parfait, je vous envoie l'invitation pour jeudi 14h. À jeudi !"],
    ],
  },
  "demo-julien-bernard": {
    messages: [
      ["sortant", 14.0, "Bonjour Julien, merci pour la connexion. Studio Lumen grandit vite, la gestion des projets clients suit ?"],
      ["entrant", 12.8, "Honnêtement non, on jongle entre trois outils."],
      ["sortant", 12.6, "Je vous propose un audit gratuit de 30 minutes de votre organisation actuelle. Vous êtes dispo cette semaine ?"],
      ["entrant", 11.0, "Ok pour vendredi matin."],
      ["sortant", 4.0, "Merci encore pour la confiance ! Je vous envoie le devis signé et on démarre lundi."],
      ["entrant", 3.6, "Super, à lundi !"],
    ],
  },
  "demo-nicolas-simon": {
    messages: [
      ["sortant", 10.0, "Bonjour Nicolas, merci d'avoir accepté. Côté tech chez Datagrove, la doc interne vit dans Notion ou dans un outil dédié ?"],
      ["entrant", 6.5, "On est sur Confluence et ça nous va bien, merci."],
    ],
  },
};

/** Conversations hors CRM : la personne n'est pas (encore) un prospect. */
export const CONVERSATIONS_HORS_CRM_DEMO: { nom: string; provider: string; nonLu?: boolean; messages: Msg[] }[] = [
  {
    nom: "Margaux Perrin",
    provider: "ACoDEMOmargauxperrin",
    nonLu: true,
    messages: [["entrant", 0.4, "Bonjour Théo, j'ai vu votre post sur les espaces Notion pour PME. Vous faites aussi des formations pour les équipes ?"]],
  },
  {
    nom: "Yanis Cordier",
    provider: "ACoDEMOyaniscordier",
    messages: [
      ["entrant", 6.0, "Salut Théo, on se croise au salon SaaS jeudi ?"],
      ["sortant", 5.8, "Oui, je serai là toute la journée, passe me voir !"],
    ],
  },
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

    // Conversations LinkedIn fictives (ce que la synchronisation Unipile importerait).
    const inserer = async (prospectId: string | null, nom: string | null, provider: string, nonLu: boolean, messages: Msg[]) => {
      const dernier = Math.min(...messages.map((m) => m[1]));
      const conv = await c.query(
        `insert into public.conversations (unipile_chat_id, prospect_id, interlocuteur_nom, interlocuteur_provider_id, dernier_message_at, non_lu, demo)
         values ($1, $2, $3, $4, $5, $6, true) returning id`,
        [`demo-chat-${provider}`, prospectId, nom, provider, jour(-dernier), nonLu],
      );
      for (const [i, [sens, avant, texte]] of messages.entries()) {
        await c.query(
          "insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at) values ($1, $2, $3, $4, $5)",
          [conv.rows[0].id, `demo-msg-${provider}-${i}`, sens, texte, jour(-avant)],
        );
      }
    };
    for (const [id, conv] of Object.entries(CONVERSATIONS_DEMO)) {
      const p = PROSPECTS_DEMO.find((x) => x.id === id)!;
      await inserer(ids.get(id)!, `${p.prenom} ${p.nom}`, providerDemo(id), conv.nonLu ?? false, conv.messages);
    }
    for (const h of CONVERSATIONS_HORS_CRM_DEMO) await inserer(null, h.nom, h.provider, h.nonLu ?? false, h.messages);

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
    await c.query("delete from public.conversations where demo");
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
