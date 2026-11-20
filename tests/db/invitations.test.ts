import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { executerUnTour } from "@/server/queue/worker";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis } from "@/server/unipile/executeur";
import { creerClientSimule } from "../fixtures/client-simule";
import { EnvoiRefuse, mettreInvitationEnFile, notesInvitationRestantes } from "@/server/mutations";
import { ficheProspectDepuis } from "@/server/donnees";
import { recalculerStatuts, traiterAcceptations, enregistrerLiens } from "@/server/relations";
import { pousserNotificationsEnAttente } from "@/server/notifications";
import { traiterWebhookUnipile } from "@/server/webhooks/unipile";
import type { ClientLinkedIn } from "@/server/unipile/types";

const JEUDI_10H = new Date("2026-11-05T09:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("invitations depuis la fiche prospect", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query(
      "truncate public.actions, public.taches, public.liens_linkedin, public.notifications, public.abonnements_push, public.prospects cascade",
    );
    await db.pool.query("update public.reglages set prochaine_action_possible_a = null");
  });

  async function prospect(
    o: { id?: string; demo?: boolean; statut?: string; etape?: string; provider?: string | null; prenom?: string } = {},
  ): Promise<string> {
    const id = o.id ?? `demo-${randomUUID().slice(0, 8)}`;
    const r = await db.pool.query(
      `insert into public.prospects (linkedin_url, url_normalisee, public_identifier, prenom, nom, demo, statut_relation, etape, provider_id)
       values ($1, $2, $3, $4, 'Durand', $5, $6, $7, $8) returning id`,
      [
        `https://linkedin.com/in/${id}`,
        `linkedin.com/in/${id}`,
        id,
        o.prenom ?? "Camille",
        o.demo ?? true,
        o.statut ?? "a_inviter",
        o.etape ?? "a_contacter",
        o.provider === undefined ? null : o.provider,
      ],
    );
    return r.rows[0].id;
  }

  const REEL = { modeSimule: false, maintenant: JEUDI_10H };

  const tour = async (client: ClientLinkedIn = creerClientSimule()) => {
    // Tâches créées à l'heure réelle : rendues échues pour le jeudi 10 h des tests.
    await db.pool.query("update public.taches set executer_apres = '2026-11-01'");
    return executerUnTour({
      pool: db.pool,
      executeur: creerExecuteur(client, { lireDestinataire: lireDestinataireDepuis(db.pool) }),
      appliquerEffets: appliquerEffetsUnipile,
      maintenant: () => JEUDI_10H,
      aleatoire: () => 0,
    });
  };
  const rouvrir = () => db.pool.query("update public.reglages set prochaine_action_possible_a = null");

  // ─── Mise en file ───────────────────────────────────────────────────────────

  it("identifiant LinkedIn inconnu : lecture du profil puis invitation, dans cet ordre", async () => {
    const id = await prospect();
    const r = await mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL);
    expect(r.nouveau).toBe(true);
    const t = await db.pool.query("select type_action, avec_note, payload from public.taches where prospect_id = $1 order by ordre", [id]);
    expect(t.rows.map((x) => x.type_action)).toEqual(["lecture_profil", "invitation"]);
    expect(t.rows[1]).toMatchObject({ avec_note: false, payload: { prospect_id: id } });
  });

  it("lecture du profil déjà en file : pas de seconde lecture", async () => {
    const id = await prospect();
    await db.pool.query(
      "insert into public.taches (type_action, prospect_id, payload, cle_idempotence) values ('lecture_profil', $1, '{\"public_identifier\": \"x-y-z\"}', 'lecture_profil:fond')",
      [id],
    );
    await mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL);
    const t = await db.pool.query("select type_action from public.taches where prospect_id = $1 order by ordre", [id]);
    expect(t.rows.map((x) => x.type_action)).toEqual(["lecture_profil", "invitation"]);
  });

  it("identifiant connu : l'invitation seule ; un double clic n'en crée qu'une", async () => {
    const id = await prospect({ provider: "ACoDEMOx1" });
    const cle = randomUUID();
    const a = await mettreInvitationEnFile(db.pool, { prospectId: id, cle }, REEL);
    const b = await mettreInvitationEnFile(db.pool, { prospectId: id, cle }, REEL);
    expect(b).toEqual({ tacheId: a.tacheId, nouveau: false });
    const t = await db.pool.query("select type_action from public.taches where prospect_id = $1", [id]);
    expect(t.rows.map((x) => x.type_action)).toEqual(["invitation"]);
  });

  it("refuse une deuxième invitation en file pour le même prospect", async () => {
    const id = await prospect({ provider: "ACoDEMOx2" });
    await mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL);
    await expect(mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL)).rejects.toThrow(EnvoiRefuse);
  });

  it("refuse un prospect déjà en relation, déjà invité ou qui t'a invité", async () => {
    for (const statut of ["en_relation", "en_attente", "invitation_recue"]) {
      const id = await prospect({ statut });
      await expect(mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL)).rejects.toThrow(EnvoiRefuse);
    }
    const n = await db.pool.query("select count(*)::int as n from public.taches");
    expect(n.rows[0].n).toBe(0);
  });

  it("Unipile non branché : refuse tout prospect, même fictif ; refuse un prospect inconnu ou une entrée invalide", async () => {
    const vrai = await prospect({ id: "jean-vrai", demo: false });
    const fictif = await prospect({ id: "demo-fictif" });
    for (const prospectId of [vrai, fictif]) {
      await expect(mettreInvitationEnFile(db.pool, { prospectId, cle: randomUUID() }, { modeSimule: true, maintenant: JEUDI_10H })).rejects.toThrow(
        /pas branché/,
      );
    }
    await expect(mettreInvitationEnFile(db.pool, { prospectId: randomUUID(), cle: randomUUID() }, REEL)).rejects.toThrow(EnvoiRefuse);
    await expect(mettreInvitationEnFile(db.pool, { prospectId: "pas-un-uuid", cle: randomUUID() }, REEL)).rejects.toThrow();
    await expect(mettreInvitationEnFile(db.pool, { prospectId: vrai }, REEL)).rejects.toThrow();
    // Mode réel : le vrai prospect est accepté.
    expect((await mettreInvitationEnFile(db.pool, { prospectId: vrai, cle: randomUUID() }, REEL)).nouveau).toBe(true);
  });

  it("note : 200 caractères au plus, vide = sans note", async () => {
    const id = await prospect({ provider: "ACoDEMOx3" });
    await expect(
      mettreInvitationEnFile(db.pool, { prospectId: id, note: "x".repeat(201), cle: randomUUID() }, REEL),
    ).rejects.toThrow();
    await mettreInvitationEnFile(db.pool, { prospectId: id, note: "   ", cle: randomUUID() }, REEL);
    const t = await db.pool.query("select avec_note, payload from public.taches where type_action = 'invitation'");
    expect(t.rows[0].avec_note).toBe(false);
    expect(t.rows[0].payload).not.toHaveProperty("note");
  });

  it("note : quota du mois compté avec les notes déjà parties et celles en file ; refus au-delà", async () => {
    // Plafond de 4 notes par mois : 2 parties ce mois-ci (1 le mois dernier, hors compte), 1 en file.
    await db.pool.query(
      `insert into public.actions (type, sortante, avec_note, resultat, created_at) values
         ('invitation', true, true, 'succes', '2026-11-02T10:00:00Z'),
         ('invitation', true, true, 'echec', '2026-11-03T10:00:00Z'),
         ('invitation', true, true, 'succes', '2026-10-30T10:00:00Z')`,
    );
    const a = await prospect({ provider: "ACoDEMOa" });
    expect(await notesInvitationRestantes(db.pool, JEUDI_10H)).toEqual({ restantes: 2, plafond: 4 });
    await mettreInvitationEnFile(db.pool, { prospectId: a, note: "Bonjour Camille", cle: randomUUID() }, REEL);
    expect(await notesInvitationRestantes(db.pool, JEUDI_10H)).toEqual({ restantes: 1, plafond: 4 });

    const b = await prospect({ provider: "ACoDEMOb" });
    await mettreInvitationEnFile(db.pool, { prospectId: b, note: "Bonjour", cle: randomUUID() }, REEL);
    const c = await prospect({ provider: "ACoDEMOc" });
    await expect(mettreInvitationEnFile(db.pool, { prospectId: c, note: "Bonjour", cle: randomUUID() }, REEL)).rejects.toThrow(
      /notes/i,
    );
    // Sans note, l'invitation reste possible.
    expect((await mettreInvitationEnFile(db.pool, { prospectId: c, cle: randomUUID() }, REEL)).nouveau).toBe(true);
  });

  it("la fiche expose l'invitation en file et les notes restantes", async () => {
    const id = await prospect({ provider: "ACoDEMOf" });
    let f = await ficheProspectDepuis(db.pool, id, JEUDI_10H);
    expect(f?.invitation).toEqual({ enFile: false, notesRestantes: 4, plafondNotes: 4 });
    await mettreInvitationEnFile(db.pool, { prospectId: id, note: "Salut", cle: randomUUID() }, REEL);
    f = await ficheProspectDepuis(db.pool, id, JEUDI_10H);
    expect(f?.invitation).toEqual({ enFile: true, notesRestantes: 3, plafondNotes: 4 });
  });

  // ─── Envoi par la file ──────────────────────────────────────────────────────

  it("envoi : lien « invitation envoyée », statut « En attente », étape « Invitation envoyée », journal", async () => {
    const id = await prospect();
    await mettreInvitationEnFile(db.pool, { prospectId: id, note: "Bonjour Camille", cle: randomUUID() }, REEL);
    expect((await tour()).statut).toBe("execute"); // lecture du profil
    await rouvrir();
    expect(await tour()).toMatchObject({ statut: "execute", resultat: "succes" }); // invitation

    const p = await db.pool.query("select statut_relation, etape, provider_id from public.prospects where id = $1", [id]);
    expect(p.rows[0]).toMatchObject({ statut_relation: "en_attente", etape: "invitation_envoyee" });
    const l = await db.pool.query("select type, source, provider_id from public.liens_linkedin where url_normalisee = $1", [
      `linkedin.com/in/${(await db.pool.query("select public_identifier from public.prospects where id = $1", [id])).rows[0].public_identifier}`,
    ]);
    expect(l.rows).toEqual([{ type: "invitation_envoyee", source: "outil", provider_id: p.rows[0].provider_id }]);
    const a = await db.pool.query(
      "select type, sortante, avec_note, resultat, details from public.actions where prospect_id = $1 order by created_at, type",
      [id],
    );
    expect(a.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invitation", sortante: true, avec_note: true, resultat: "succes" }),
        expect.objectContaining({ type: "changement_etape", details: { vers: "invitation_envoyee", cause: "invitation" } }),
      ]),
    );
  });

  it("envoi refusé si le prospect est devenu relation entre-temps : échec au journal, rien chez LinkedIn", async () => {
    const id = await prospect({ id: "paul-reel", demo: false, provider: "ACoPAUL1" });
    await mettreInvitationEnFile(db.pool, { prospectId: id, cle: randomUUID() }, REEL);
    await db.pool.query("update public.prospects set statut_relation = 'en_relation' where id = $1", [id]);
    let appels = 0;
    const client = { ...creerClientSimule(), inviter: async () => (appels++, { ok: true as const, donnees: { invitationId: "x" } }) };
    expect(await tour(client)).toMatchObject({ resultat: "echec" });
    expect(appels).toBe(0);
  });

  it("envoi réel : l'identifiant LinkedIn et la note partent tels quels", async () => {
    const id = await prospect({ id: "lea-reel", demo: false, provider: "ACoLEA123" });
    await mettreInvitationEnFile(db.pool, { prospectId: id, note: "Ravi d'échanger", cle: randomUUID() }, REEL);
    const recus: unknown[] = [];
    const client = {
      ...creerClientSimule(),
      inviter: async (providerId: string, note?: string) => (recus.push([providerId, note]), { ok: true as const, donnees: { invitationId: "inv_1" } }),
    };
    expect(await tour(client)).toMatchObject({ resultat: "succes" });
    expect(recus).toEqual([["ACoLEA123", "Ravi d'échanger"]]);
    // L'identifiant de l'invitation est gardé sur le lien : il servira à la retirer.
    const l = await db.pool.query("select invitation_id from public.liens_linkedin where type = 'invitation_envoyee' and provider_id = 'ACoLEA123'");
    expect(l.rows).toEqual([{ invitation_id: "inv_1" }]);
  });

  // ─── Acceptation ────────────────────────────────────────────────────────────

  async function accepter(id: string) {
    const url = (await db.pool.query("select url_normalisee from public.prospects where id = $1", [id])).rows[0].url_normalisee;
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await enregistrerLiens(c, [{ type: "relation", urlNormalisee: url }], "sync");
      await traiterAcceptations(c, await recalculerStatuts(c, { urls: [url] }));
      await c.query("commit");
    } finally {
      c.release();
    }
  }

  it("acceptation : étape « À contacter » (code connecte) et une notification vers la fiche, une seule fois", async () => {
    const id = await prospect({ statut: "en_attente", etape: "invitation_envoyee", prenom: "Inès" });
    await accepter(id);
    const p = await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [id]);
    expect(p.rows[0]).toEqual({ statut_relation: "en_relation", etape: "connecte" });
    const n = await db.pool.query("select type, titre, lien, push_a_envoyer from public.notifications");
    expect(n.rows).toEqual([
      { type: "invitation_acceptee", titre: "Inès Durand a accepté ton invitation", lien: `/?prospect=${id}&onglet=conversation`, push_a_envoyer: true },
    ]);
    const e = await db.pool.query("select libelle from public.etapes where code in ('a_contacter', 'connecte') order by ordre");
    expect(e.rows.map((x) => x.libelle)).toEqual(["À inviter", "À contacter"]);

    // Relation perdue puis retrouvée : pas de seconde notification.
    await db.pool.query("delete from public.liens_linkedin");
    await db.pool.query("update public.prospects set statut_relation = 'en_attente' where id = $1", [id]);
    await accepter(id);
    const n2 = await db.pool.query("select count(*)::int as n from public.notifications");
    expect(n2.rows[0].n).toBe(1);
  });

  it("webhook relation.new : invitation envoyée hors de l'outil (statut « à inviter ») → notifiée aussi", async () => {
    const SECRET = randomBytes(24).toString("hex");
    const T = 1_793_980_800;
    const id = await prospect({ id: "max-reel", demo: false, statut: "a_inviter", etape: "a_contacter", prenom: "Max" });
    const corps = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "relation.new",
      account_id: "acc_moi",
      created_at: "2026-11-06T10:00:00Z",
      payload: { id: "rel_2", object: "UserRelation", user: { id: "ACoMAX", public_identifier: "max-reel", display_name: "Max" } },
    });
    const signature = `t=${T},v0=${createHmac("sha256", SECRET).update(`${T}.${corps}`).digest("hex")}`;
    const r = await traiterWebhookUnipile(db.pool, corps, signature, { secret: SECRET, accountId: "acc_moi", maintenantMs: T * 1000 });
    expect(r.status).toBe(200);
    const n = await db.pool.query("select titre from public.notifications");
    expect(n.rows).toEqual([{ titre: "Max Durand a accepté ton invitation" }]);
    const p = await db.pool.query("select statut_relation, etape from public.prospects where id = $1", [id]);
    expect(p.rows[0]).toEqual({ statut_relation: "en_relation", etape: "connecte" });
  });

  it("une relation découverte par une liste (sans invitation connue) n'est pas notifiée", async () => {
    const id = await prospect({ statut: "a_inviter", etape: "a_contacter" });
    await accepter(id);
    expect((await db.pool.query("select count(*)::int as n from public.notifications")).rows[0].n).toBe(0);
    expect((await db.pool.query("select etape from public.prospects where id = $1", [id])).rows[0].etape).toBe("connecte");
  });

  it("Push différé : une notification seule telle quelle, plusieurs regroupées, jamais deux fois", async () => {
    await db.pool.query(
      "insert into public.abonnements_push (endpoint, p256dh, auth) values ('https://push.example.com/a', 'cle', 'auth')",
    );
    const envoyes: { titre: string; lien: string }[] = [];
    const envoyer = async (_a: unknown, charge: string) => {
      envoyes.push(JSON.parse(charge));
    };
    const a = await prospect({ statut: "en_attente", etape: "invitation_envoyee", prenom: "Ana" });
    await accepter(a);
    await pousserNotificationsEnAttente(db.pool, envoyer);
    expect(envoyes).toEqual([expect.objectContaining({ titre: "Ana Durand a accepté ton invitation", lien: `/?prospect=${a}&onglet=conversation` })]);

    const b = await prospect({ statut: "en_attente", etape: "invitation_envoyee", prenom: "Bob" });
    const c = await prospect({ statut: "en_attente", etape: "invitation_envoyee", prenom: "Céline" });
    await accepter(b);
    await accepter(c);
    await pousserNotificationsEnAttente(db.pool, envoyer);
    expect(envoyes[1]).toMatchObject({ titre: "2 invitations acceptées", lien: "/" });
    await pousserNotificationsEnAttente(db.pool, envoyer);
    expect(envoyes).toHaveLength(2);
  });

  it("webhook relation.new : notification créée et poussée après validation", async () => {
    const SECRET = randomBytes(24).toString("hex");
    const T = 1_793_980_800;
    const id = await prospect({ id: "eva-reel", demo: false, statut: "en_attente", etape: "invitation_envoyee", prenom: "Eva" });
    await db.pool.query(
      "insert into public.abonnements_push (endpoint, p256dh, auth) values ('https://push.example.com/b', 'cle', 'auth')",
    );
    const corps = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "relation.new",
      account_id: "acc_moi",
      created_at: "2026-11-06T10:00:00Z",
      payload: { id: "rel_1", object: "UserRelation", user: { id: "ACoEVA", public_identifier: "eva-reel", display_name: "Eva" } },
    });
    const signature = `t=${T},v0=${createHmac("sha256", SECRET).update(`${T}.${corps}`).digest("hex")}`;
    const pousses: string[] = [];
    const r = await traiterWebhookUnipile(db.pool, corps, signature, {
      secret: SECRET,
      accountId: "acc_moi",
      maintenantMs: T * 1000,
      deps: { envoyerPush: async (_a, charge) => void pousses.push(JSON.parse(charge).titre) },
    });
    expect(r.status).toBe(200);
    expect(pousses).toEqual(["Eva Durand a accepté ton invitation"]);
    const n = await db.pool.query("select lien, push_a_envoyer from public.notifications");
    expect(n.rows).toEqual([{ lien: `/?prospect=${id}&onglet=conversation`, push_a_envoyer: false }]);
  });
});
