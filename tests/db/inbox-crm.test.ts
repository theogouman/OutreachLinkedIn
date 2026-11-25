import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { ajouterAuCrm, entrepriseDepuisTitre, masquerConversation, prenomNom, reafficherConversation } from "@/server/inbox-crm";
import { etatOutilDepuis, inboxDepuis } from "@/server/donnees";

const etat = vi.hoisted(() => ({ pool: null as unknown, connecte: true }));
vi.mock("@/server/auth", () => ({
  exigerUtilisateur: async () => {
    if (!etat.connecte) throw new Error("NEXT_REDIRECT /login");
    return { email: "theo@example.com" };
  },
}));
vi.mock("@/server/db", () => ({ poolServeur: () => etat.pool }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

describe("Inbox : nom et entreprise lus dans les données LinkedIn", () => {
  it("prénom et nom sans emojis ni compléments", () => {
    expect(prenomNom("🧠 Sarah Bloyet")).toEqual({ prenom: "Sarah", nom: "Bloyet" });
    expect(prenomNom("Sarah Ben Allel")).toEqual({ prenom: "Sarah", nom: "Ben Allel" });
    expect(prenomNom("Aude Nyadanu, PhD")).toEqual({ prenom: "Aude", nom: "Nyadanu" });
    expect(prenomNom("Cher")).toEqual({ prenom: "Cher", nom: null });
    expect(prenomNom("🟣💡")).toEqual({ prenom: null, nom: null });
  });
  it("entreprise depuis le titre (at, chez, @), sinon rien", () => {
    expect(entrepriseDepuisTitre("Chief People Officer at Qonto")).toBe("Qonto");
    expect(entrepriseDepuisTitre("CEO chez Lydia | Paris")).toBe("Lydia");
    expect(entrepriseDepuisTitre("Fondateur @Hiboo")).toBe("Hiboo");
    expect(entrepriseDepuisTitre("Office manager")).toBeNull();
    expect(entrepriseDepuisTitre(null)).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("Inbox : ne plus afficher, ajouter au CRM", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    etat.pool = db.pool;
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    etat.connecte = true;
    await db.pool.query("truncate public.conversations, public.prospects, public.inbox_masques, public.taches, public.actions cascade");
  });

  const conversation = async (chat: string, nom: string, provider: string | null, pid: string | null, titre: string | null = null, nonLu = true) =>
    (
      await db.pool.query(
        `insert into public.conversations (unipile_chat_id, interlocuteur_nom, interlocuteur_titre, interlocuteur_provider_id, interlocuteur_public_identifier, non_lu, dernier_message_at)
         values ($1, $2, $3, $4, $5, $6, now()) returning id`,
        [chat, nom, titre, provider, pid, nonLu],
      )
    ).rows[0].id as string;
  const visibles = async (f = {}) => (await inboxDepuis(db.pool, { page: 1, ...f })).lignes.map((l) => l.nom).sort();

  it("ne plus afficher : la personne sort de l'Inbox et des non lus, toutes ses conversations, même futures ; récupérable", async () => {
    const a = await conversation("c1", "Sarah Ben Allel", "ACoAAAeK5MUB8z1MTM9Zp", "sarah-ben-allel");
    await conversation("c2", "Hugo Martin", "ACoAAHugoMartin00", null);
    expect(await visibles()).toEqual(["Hugo Martin", "Sarah Ben Allel"]);
    expect((await etatOutilDepuis(db.pool)).nonLus).toBe(2);

    await masquerConversation(db.pool, a);
    expect(await visibles()).toEqual(["Hugo Martin"]);
    expect(await visibles({ masquees: "oui" })).toEqual(["Sarah Ben Allel"]);
    expect((await etatOutilDepuis(db.pool)).nonLus).toBe(1);
    // Nouvelle conversation de la même personne : masquée elle aussi.
    await conversation("c3", "Sarah Ben Allel", "ACoAAAeK5MUB8z1MTM9Zp", null);
    expect(await visibles()).toEqual(["Hugo Martin"]);

    await reafficherConversation(db.pool, a);
    expect(await visibles()).toEqual(["Hugo Martin", "Sarah Ben Allel", "Sarah Ben Allel"]);
  });

  it("ne plus afficher sans identifiant LinkedIn : la conversation seule", async () => {
    const a = await conversation("c1", "Contact LinkedIn", null, null);
    await conversation("c2", "Contact LinkedIn bis", null, null);
    await masquerConversation(db.pool, a);
    expect(await visibles()).toEqual(["Contact LinkedIn bis"]);
    await expect(masquerConversation(db.pool, crypto.randomUUID())).rejects.toThrow(/introuvable/);
    await expect(masquerConversation(db.pool, "pas-un-uuid")).rejects.toThrow();
  });

  it("ajouter au CRM : fiche créée (nom, poste, entreprise du titre, liste Inbox), conversations rattachées, photo reprise, étape et lecture de profil", async () => {
    const a = await conversation("c1", "Sarah Ben Allel", "ACoAAAeK5MUB8z1MTM9Zp", "sarah-ben-allel-b1946636", "Chief People Officer at Qonto");
    const b = await conversation("c2", "Sarah Ben Allel", "ACoAAAeK5MUB8z1MTM9Zp", null);
    await db.pool.query("insert into public.photos_conversations (conversation_id, contenu, type_mime) values ($1, '\\xffd8ff', 'image/jpeg')", [a]);
    await db.pool.query(
      `insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at) values
         ($1, 'm1', 'sortant', 'Bonjour Sarah', now() - interval '2 days'), ($1, 'm2', 'entrant', 'Avec plaisir', now() - interval '1 day')`,
      [a],
    );

    const r = await ajouterAuCrm(db.pool, a);
    expect(r.existant).toBe(false);
    const p = (await db.pool.query("select * from public.prospects where id = $1", [r.prospectId])).rows[0];
    expect(p).toMatchObject({
      prenom: "Sarah",
      nom: "Ben Allel",
      poste: "Chief People Officer at Qonto",
      entreprise: "Qonto",
      liste_origine: "Inbox",
      url_normalisee: "linkedin.com/in/sarah-ben-allel-b1946636",
      provider_id: "ACoAAAeK5MUB8z1MTM9Zp",
      etape: "repondu",
    });
    expect(p.photo_maj).not.toBeNull();
    expect((await db.pool.query("select count(*)::int as n from public.conversations where prospect_id = $1", [r.prospectId])).rows[0].n).toBe(2);
    expect((await db.pool.query("select prospect_id from public.conversations where id = $1", [b])).rows[0].prospect_id).toBe(r.prospectId);
    const t = (await db.pool.query("select type_action, payload from public.taches where prospect_id = $1", [r.prospectId])).rows;
    expect(t).toEqual([{ type_action: "lecture_profil", payload: { public_identifier: "sarah-ben-allel-b1946636", ajout_crm: true } }]);

    // Déjà dans le CRM : refusé.
    await expect(ajouterAuCrm(db.pool, a)).rejects.toThrow(/déjà dans le CRM/);
  });

  it("ajouter au CRM une personne déjà présente (même adresse) : conversation rattachée, aucune fiche en double ; sans identifiant : refusé", async () => {
    const existant = (
      await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, prenom, nom) values ('https://www.linkedin.com/in/hugo-m', 'linkedin.com/in/hugo-m', 'Hugo', 'M') returning id",
      )
    ).rows[0].id;
    const a = await conversation("c1", "Hugo M", null, "hugo-m");
    expect(await ajouterAuCrm(db.pool, a)).toEqual({ prospectId: existant, existant: true });
    expect((await db.pool.query("select count(*)::int as n from public.prospects")).rows[0].n).toBe(1);

    const anonyme = await conversation("c2", "Contact LinkedIn", null, null);
    await expect(ajouterAuCrm(db.pool, anonyme)).rejects.toThrow(/Identifiant LinkedIn inconnu/);
    await expect(ajouterAuCrm(db.pool, "pas-un-uuid")).rejects.toThrow();
  });

  it("actions serveur : sans session, refusées avant toute écriture", async () => {
    const a = await conversation("c1", "Sarah Ben Allel", "ACoAAAeK5MUB8z1MTM9Zp", "sarah-ben-allel");
    const { actionMasquerConversation, actionReafficherConversation, actionAjouterAuCrm } = await import("@/app/actions");
    etat.connecte = false;
    await expect(actionMasquerConversation(a)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actionReafficherConversation(a)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actionAjouterAuCrm(a)).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await db.pool.query("select count(*)::int as n from public.inbox_masques")).rows[0].n).toBe(0);
    expect((await db.pool.query("select count(*)::int as n from public.prospects")).rows[0].n).toBe(0);
    etat.connecte = true;
    expect(await actionAjouterAuCrm(a)).toMatchObject({ ok: true });
    expect(await actionMasquerConversation("pas-un-uuid")).toEqual({ ok: false, message: "Valeurs invalides." });
  });
});
