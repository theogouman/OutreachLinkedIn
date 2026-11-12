import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./helpers";
import { synchroniserMessagerie, type DependancesSynchro } from "@/server/synchro-messagerie";
import type { ConversationListee } from "@/server/unipile/types";
import type { MessageUnipile } from "@/server/conversations";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);

function conv(chatId: string, i: Partial<ConversationListee["interlocuteur"]>, extra: Partial<ConversationListee> = {}): ConversationListee {
  return {
    chatId,
    aDeux: true,
    nonLues: 0,
    dernierMessageA: new Date("2026-11-10T09:00:00Z"),
    interlocuteur: { providerId: null, publicIdentifier: null, nom: null, titre: null, photoUrl: null, ...i },
    ...extra,
  };
}
function msg(id: string, chatId: string, quand: string, isSender: boolean, text = `texte ${id}`): MessageUnipile {
  return { id, chat_id: chatId, text, timestamp: quand, is_sender: isSender, sender_id: isSender ? "MOI" : "LUI" };
}

/** Faux client : conversations servies par pages (décalage), messages par conversation. */
function deps(conversations: ConversationListee[], messages: Record<string, MessageUnipile[]>, appels: string[] = []): DependancesSynchro {
  return {
    client: {
      listerConversations: async (limite, _curseur, offset = 0) => {
        appels.push(`chats@${offset}`);
        const page = conversations.slice(offset, offset + limite);
        return { ok: true, donnees: { conversations: page, lus: page.length, suivant: null } };
      },
      listerMessages: async (chatId) => {
        appels.push(`messages:${chatId}`);
        const m = messages[chatId] ?? [];
        return { ok: true, donnees: { messages: m, lus: m.length, suivant: null } };
      },
    },
    telechargerPhoto: async () => ({ contenu: JPEG, type: "image/jpeg" }),
  };
}

describe.skipIf(!TEST_DATABASE_URL)("synchronisation complète de la messagerie", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query("truncate public.prospects, public.conversations, public.conversations_supprimees cascade");
    await db.pool.query(
      "update public.synchro_messagerie set active = true, offset_conversations = 0, curseur = null, premier_vu = null, reprendre_apres = null, liste_terminee_le = null, derniere_erreur = null",
    );
  });

  const prospect = async (id: string, extra: { provider_id?: string } = {}) =>
    (
      await db.pool.query(
        "insert into public.prospects (linkedin_url, url_normalisee, public_identifier, provider_id, statut_relation) values ($1, $2, $3, $4, 'en_relation') returning id",
        [`https://www.linkedin.com/in/${id}`, `linkedin.com/in/${id}`, id, extra.provider_id ?? null],
      )
    ).rows[0].id as string;

  it("inactive : rien n'est lu", async () => {
    await db.pool.query("update public.synchro_messagerie set active = false");
    const appels: string[] = [];
    await synchroniserMessagerie(db.pool, deps([conv("c1", { providerId: "ACo1" })], {}, appels));
    expect(appels).toEqual([]);
  });

  it("rattache chaque conversation au prospect (URL ou identifiant), identifie le prospect, garde l'identité d'un inconnu", async () => {
    const lea = await prospect("lea-martin");
    const tom = await prospect("tom-d", { provider_id: "ACoT" });
    const d = deps(
      [
        conv("c-lea", { providerId: "ACoL", publicIdentifier: "lea-martin", nom: "Léa Martin", photoUrl: "https://media.licdn.com/l.jpg" }, { nonLues: 1 }),
        conv("c-tom", { providerId: "ACoT", nom: "Tom D" }),
        conv("c-zoe", { providerId: "ACoZ", publicIdentifier: "zoe-r", nom: "Zoé Roy", titre: "CEO Acme", photoUrl: "https://media.licdn.com/z.jpg" }),
        conv("c-groupe", { nom: "Groupe" }, { aDeux: false }),
      ],
      {
        "c-lea": [msg("m2", "c-lea", "2026-11-10T09:00:00Z", false, "Avec plaisir"), msg("m1", "c-lea", "2026-11-09T09:00:00Z", true, "Bonjour Léa")],
        "c-tom": [msg("m3", "c-tom", "2026-11-08T09:00:00Z", true)],
        "c-zoe": [msg("m4", "c-zoe", "2026-11-07T09:00:00Z", false)],
      },
    );
    await synchroniserMessagerie(db.pool, d);

    const c = await db.pool.query(
      `select unipile_chat_id, prospect_id, interlocuteur_nom, interlocuteur_titre, interlocuteur_public_identifier, non_lu,
              photo_maj is not null as photo, messages_synchro_le is not null as synchro
         from public.conversations order by unipile_chat_id`,
    );
    expect(c.rows).toEqual([
      expect.objectContaining({ unipile_chat_id: "c-lea", prospect_id: lea, non_lu: true, synchro: true }),
      expect.objectContaining({ unipile_chat_id: "c-tom", prospect_id: tom, synchro: true }),
      expect.objectContaining({
        unipile_chat_id: "c-zoe", prospect_id: null, interlocuteur_nom: "Zoé Roy", interlocuteur_titre: "CEO Acme",
        interlocuteur_public_identifier: "zoe-r", photo: true, synchro: true,
      }),
    ]);
    const p = await db.pool.query("select provider_id, photo_maj is not null as photo from public.prospects where id = $1", [lea]);
    expect(p.rows[0]).toEqual({ provider_id: "ACoL", photo: true });
    const fil = await db.pool.query(
      "select m.sens, m.texte from public.messages m join public.conversations c on c.id = m.conversation_id where c.unipile_chat_id = 'c-lea' order by m.envoye_at",
    );
    expect(fil.rows).toEqual([{ sens: "sortant", texte: "Bonjour Léa" }, { sens: "entrant", texte: "Avec plaisir" }]);
    const etat = await db.pool.query("select liste_terminee_le is not null as terminee from public.synchro_messagerie");
    expect(etat.rows[0].terminee).toBe(true);
  });

  it("conversation reprise de l'archive : reliée au chat, ses messages remplacés par l'historique complet", async () => {
    const ana = await prospect("ana-b");
    const archive = await db.pool.query(
      "insert into public.conversations (prospect_id, linkedin_conversation_id, dernier_message_at) values ($1, 'arch-1', '2026-10-01') returning id",
      [ana],
    );
    await db.pool.query("insert into public.messages (conversation_id, sens, texte, envoye_at) values ($1, 'sortant', 'Bonjour Ana', '2026-10-01')", [
      archive.rows[0].id,
    ]);
    await synchroniserMessagerie(
      db.pool,
      deps([conv("c-ana", { providerId: "ACoA", publicIdentifier: "ana-b" })], {
        "c-ana": [msg("a2", "c-ana", "2026-10-02T09:00:00Z", false, "Merci"), msg("a1", "c-ana", "2026-10-01T09:00:00Z", true, "Bonjour Ana")],
      }),
    );
    const c = await db.pool.query("select id, unipile_chat_id from public.conversations");
    expect(c.rows).toEqual([{ id: archive.rows[0].id, unipile_chat_id: "c-ana" }]);
    const m = await db.pool.query("select texte, unipile_message_id from public.messages order by envoye_at");
    expect(m.rows).toEqual([
      { texte: "Bonjour Ana", unipile_message_id: "a1" },
      { texte: "Merci", unipile_message_id: "a2" },
    ]);
  });

  it("conversation déjà connue (webhook) : historique complété sans doublon", async () => {
    const c = await db.pool.query("insert into public.conversations (unipile_chat_id, interlocuteur_provider_id) values ('c-w', 'ACoW') returning id");
    await db.pool.query(
      "insert into public.messages (conversation_id, unipile_message_id, sens, texte, envoye_at) values ($1, 'w2', 'entrant', 'récent', '2026-11-10')",
      [c.rows[0].id],
    );
    await synchroniserMessagerie(
      db.pool,
      deps([conv("c-w", { providerId: "ACoW" })], { "c-w": [msg("w2", "c-w", "2026-11-10T00:00:00Z", false, "récent"), msg("w1", "c-w", "2026-11-01T00:00:00Z", true)] }),
    );
    const m = await db.pool.query("select unipile_message_id from public.messages order by envoye_at");
    expect(m.rows.map((x) => x.unipile_message_id)).toEqual(["w1", "w2"]);
  });

  it("conversation supprimée dans l'outil : pas recréée sans nouveau message ; sinon, seuls les messages postérieurs reviennent", async () => {
    await db.pool.query(
      "insert into public.conversations_supprimees (unipile_chat_id, supprimee_le) values ('c-vieux', '2026-11-11'), ('c-relance', '2026-11-05')",
    );
    await synchroniserMessagerie(
      db.pool,
      deps(
        [
          conv("c-vieux", { providerId: "ACoV" }, { dernierMessageA: new Date("2026-11-10") }),
          conv("c-relance", { providerId: "ACoR" }, { dernierMessageA: new Date("2026-11-10") }),
        ],
        {
          "c-vieux": [msg("v1", "c-vieux", "2026-11-10T00:00:00Z", false)],
          "c-relance": [msg("r2", "c-relance", "2026-11-10T00:00:00Z", false), msg("r1", "c-relance", "2026-11-01T00:00:00Z", true)],
        },
      ),
    );
    const c = await db.pool.query("select unipile_chat_id from public.conversations");
    expect(c.rows.map((x) => x.unipile_chat_id)).toEqual(["c-relance"]);
    const m = await db.pool.query("select unipile_message_id from public.messages");
    expect(m.rows.map((x) => x.unipile_message_id)).toEqual(["r2"]);
  });

  it("par pages, d'un tour à l'autre, dans le budget de temps ; reprend au bon décalage", async () => {
    const liste = Array.from({ length: 120 }, (_, i) => conv(`c${String(i).padStart(3, "0")}`, { providerId: `ACo${i}` }));
    const appels: string[] = [];
    // Budget nul : une seule page par tour, aucun historique.
    await synchroniserMessagerie(db.pool, deps(liste, {}, appels), 0);
    await synchroniserMessagerie(db.pool, deps(liste, {}, appels), 0);
    expect(appels.filter((a) => a.startsWith("chats"))).toEqual(["chats@0", "chats@50"]);
    const n = await db.pool.query("select count(*)::int as n from public.conversations");
    expect(n.rows[0].n).toBe(100);
  });

  it("pages plus courtes que demandé (taille imposée par Unipile) : la liste continue jusqu'à une page vide", async () => {
    const liste = Array.from({ length: 45 }, (_, i) => conv(`d${String(i).padStart(3, "0")}`, { providerId: `ACoD${i}` }));
    const appels: string[] = [];
    const d = deps(liste, {}, appels);
    // Le fournisseur sert 20 conversations par page quoi qu'on demande.
    const lister = d.client.listerConversations;
    d.client.listerConversations = (_limite, curseur, offset) => lister(20, curseur, offset);
    await synchroniserMessagerie(db.pool, d);
    expect(appels.filter((a) => a.startsWith("chats"))).toEqual(["chats@0", "chats@20", "chats@40", "chats@45"]);
    expect((await db.pool.query("select count(*)::int as n from public.conversations")).rows[0].n).toBe(45);
    expect((await db.pool.query("select liste_terminee_le is not null as fin from public.synchro_messagerie")).rows[0].fin).toBe(true);
  });

  it("page identique à la précédente (décalage ignoré) : la liste s'arrête au lieu de boucler", async () => {
    const appels: string[] = [];
    const page = [conv("e1", { providerId: "ACoE1" }), conv("e2", { providerId: "ACoE2" })];
    const d: DependancesSynchro = {
      client: {
        listerConversations: async (_l, _c, offset = 0) => (appels.push(`chats@${offset}`), { ok: true, donnees: { conversations: page, lus: 2, suivant: null } }),
        listerMessages: async () => ({ ok: true, donnees: { messages: [], lus: 0, suivant: null } }),
      },
    };
    await synchroniserMessagerie(db.pool, d);
    expect(appels).toEqual(["chats@0", "chats@2"]);
    expect((await db.pool.query("select liste_terminee_le is not null as fin from public.synchro_messagerie")).rows[0].fin).toBe(true);
  });

  it("limite de fréquence Unipile (429) : pause du délai demandé, puis reprise", async () => {
    const appels: string[] = [];
    let limite = true;
    const d: DependancesSynchro = {
      client: {
        listerConversations: async (_l, _c, offset = 0) => {
          appels.push(`chats@${offset}`);
          return limite
            ? { ok: false, erreur: { status: 429, type: "api/too_many_requests", retryAfterS: 120 } }
            : { ok: true, donnees: { conversations: [], lus: 0, suivant: null } };
        },
        listerMessages: async () => ({ ok: true, donnees: { messages: [], lus: 0, suivant: null } }),
      },
    };
    await synchroniserMessagerie(db.pool, d);
    const pause = (await db.pool.query("select reprendre_apres from public.synchro_messagerie")).rows[0].reprendre_apres as Date;
    expect(pause.getTime() - Date.now()).toBeGreaterThan(100_000);
    limite = false;
    await synchroniserMessagerie(db.pool, d); // en pause : aucun appel
    expect(appels).toEqual(["chats@0"]);
    await db.pool.query("update public.synchro_messagerie set reprendre_apres = now() - interval '1 second'");
    await synchroniserMessagerie(db.pool, d);
    expect(appels).toEqual(["chats@0", "chats@0"]);
  });

  it("erreur Unipile : notée, rien de cassé, reprise au tour suivant", async () => {
    const d: DependancesSynchro = {
      client: {
        listerConversations: async () => ({ ok: false, erreur: { status: 429, type: "api/too_many_requests", detail: "slow down" } }),
        listerMessages: async () => ({ ok: true, donnees: { messages: [], lus: 0, suivant: null } }),
      },
    };
    await synchroniserMessagerie(db.pool, d);
    const e = await db.pool.query("select derniere_erreur, offset_conversations from public.synchro_messagerie");
    expect(e.rows[0]).toEqual({ derniere_erreur: "429 api/too_many_requests slow down", offset_conversations: 0 });
  });
});
