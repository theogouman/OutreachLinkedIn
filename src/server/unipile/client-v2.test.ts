import { describe, expect, it, vi } from "vitest";
import { creerClientUnipileV2 } from "./client-v2";

function fetchFactice(status: number, corps: unknown, headers: Record<string, string> = {}) {
  return vi.fn<(url: URL | RequestInfo, init?: RequestInit) => Promise<Response>>(async () =>
    new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json", ...headers } }),
  );
}

const OPTS = { apiKey: "cle-de-test-123", accountId: "acc_test", baseUrl: "https://api.example.test" };

describe("client Unipile v2", () => {
  it("lit un profil par identifiant public, sans notifier de visite", async () => {
    const f = fetchFactice(200, {
      object: "UserProfile",
      id: "ACoAAB123",
      public_identifier: "jane-doe",
      first_name: "Jane",
      last_name: "Doe",
      description: "CEO chez Acme",
      display_name: "Jane Doe",
      specifics: { network_distance: "FIRST_DEGREE" },
    });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireProfil("jane-doe");
    expect(r).toEqual({
      ok: true,
      donnees: {
        providerId: "ACoAAB123",
        publicIdentifier: "jane-doe",
        prenom: "Jane",
        nom: "Doe",
        titre: "CEO chez Acme",
        distance: "FIRST_DEGREE",
        invitation: null,
      },
    });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example.test/v2/acc_test/users/jane-doe?variant=linkedin_classic");
    expect((init?.headers as Record<string, string>)["X-API-KEY"]).toBe("cle-de-test-123");
    expect(String(url)).not.toMatch(/visit/);
  });

  it("signale une invitation en attente vue sur le profil", async () => {
    const f = fetchFactice(200, { id: "ACo1", specifics: { relation_request: { type: "sent", id: "r1" }, relation_request_status: "PENDING" } });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireProfil("x-y-z");
    expect(r.ok && r.donnees.invitation).toBe("envoyee");
  });

  it("encode l'identifiant (pas d'injection de chemin)", async () => {
    const f = fetchFactice(200, { id: "ACo1" });
    await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireProfil("../../accounts");
    expect(String(f.mock.calls[0]![0])).toContain("/users/..%2F..%2Faccounts?");
  });

  it("lit la première page des relations (provider id de la personne, pas de la relation)", async () => {
    const f = fetchFactice(200, {
      data: [{ id: "rel_1", object: "UserRelation", created_at: "2026-11-01T10:00:00Z", user: { id: "ACoU1", public_identifier: "bob", display_name: "Bob" } }],
      next_cursor: "abc",
    });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireListe("relations", 50);
    expect(r).toEqual({ ok: true, donnees: [{ providerId: "ACoU1", publicIdentifier: "bob", date: new Date("2026-11-01T10:00:00Z") }] });
    expect(String(f.mock.calls[0]![0])).toBe("https://api.example.test/v2/acc_test/users/me/relations?limit=50");
  });

  it("lit les invitations envoyées / reçues", async () => {
    const f = fetchFactice(200, { data: [{ id: "req1", object: "RelationRequest", type: "sent", user: { id: "ACoU2" } }, { id: "req2", type: "sent" }] });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireListe("invitations_envoyees", 500);
    expect(r).toEqual({ ok: true, donnees: [{ providerId: "ACoU2", publicIdentifier: null, date: null }] });
    expect(String(f.mock.calls[0]![0])).toContain("relation-requests?type=sent&limit=100");
  });

  it("remonte le statut, le type, le détail et retry-after d'une erreur", async () => {
    const f = fetchFactice(
      429,
      { object: "Error", type: "api/too_many_requests", status: 429, title: "x", detail: "slow down" },
      { "retry-after": "120" },
    );
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireListe("relations", 20);
    expect(r).toEqual({ ok: false, erreur: { status: 429, type: "api/too_many_requests", detail: "slow down", retryAfterS: 120 } });
  });

  it("réseau coupé ou délai dépassé → statut null (incertain)", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireProfil("x-y-z");
    expect(r).toEqual({ ok: false, erreur: { status: null } });
  });

  it("réponse au format inattendu → erreur, jamais de donnée devinée", async () => {
    const f = fetchFactice(200, { inattendu: true });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).lireProfil("x-y-z");
    expect(r).toMatchObject({ ok: false, erreur: { status: 400, type: "reponse_inattendue" } });
  });

  it("refuse un identifiant de compte mal formé", () => {
    expect(() => creerClientUnipileV2({ ...OPTS, accountId: "../x" })).toThrow();
  });

  it("envoie un message dans une conversation existante : POST JSON, réponse MessageSent", async () => {
    const f = fetchFactice(200, { object: "MessageSent", message_id: "msg_42" });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).envoyerMessage("chat/1", "Bonjour Camille");
    expect(r).toEqual({ ok: true, donnees: { messageId: "msg_42" } });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example.test/v2/acc_test/chats/chat%2F1/messages/send");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ text: "Bonjour Camille" });
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("message : identifiant en tableau ou absent, réponse inattendue, refus de LinkedIn", async () => {
    const c = (status: number, corps: unknown) => creerClientUnipileV2({ ...OPTS, fetch: fetchFactice(status, corps) as unknown as typeof fetch });
    expect(await c(200, { object: "MessageSent", message_id: ["a", "b"] }).envoyerMessage("x", "t")).toEqual({ ok: true, donnees: { messageId: "a" } });
    expect(await c(200, { object: "MessageSent", message_id: null }).envoyerMessage("x", "t")).toEqual({ ok: true, donnees: { messageId: null } });
    expect(await c(200, { object: "Autre" }).envoyerMessage("x", "t")).toMatchObject({ ok: false, erreur: { type: "reponse_inattendue" } });
    expect(await c(422, { type: "provider/unprocessable_entity" }).envoyerMessage("x", "t")).toMatchObject({
      ok: false,
      erreur: { status: 422, type: "provider/unprocessable_entity" },
    });
  });

  it("premier message : démarre une conversation depuis la boîte LinkedIn classique, sans InMail", async () => {
    const f = fetchFactice(200, { object: "ChatStarted", chat_id: "chat_9", message_id: "msg_1" });
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).demarrerConversation("ACoAAB12cd", "Bonjour Camille");
    expect(r).toEqual({ ok: true, donnees: { chatId: "chat_9", messageId: "msg_1" } });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example.test/v2/acc_test/inboxes/CLASSIC_PRIMARY/chats/send");
    expect(init?.method).toBe("POST");
    // Corps strict : aucune option `specifics` (donc jamais d'InMail).
    expect(JSON.parse(String(init?.body))).toEqual({ text: "Bonjour Camille", users_ids: "ACoAAB12cd" });
  });

  it("premier message : identifiant invalide refusé sans appel, réponse inattendue rejetée", async () => {
    const f = fetchFactice(200, {});
    const r = await creerClientUnipileV2({ ...OPTS, fetch: f as unknown as typeof fetch }).demarrerConversation("../accounts", "t");
    expect(r).toMatchObject({ ok: false, erreur: { type: "identifiant_invalide" } });
    expect(f).not.toHaveBeenCalled();
    const c = (status: number, corps: unknown) => creerClientUnipileV2({ ...OPTS, fetch: fetchFactice(status, corps) as unknown as typeof fetch });
    expect(await c(200, { object: "MessageSent", message_id: "x" }).demarrerConversation("ACoAAB12cd", "t")).toMatchObject({
      ok: false,
      erreur: { type: "reponse_inattendue" },
    });
    expect(await c(200, { object: "ChatStarted", chat_id: "c", message_id: ["m1", "m2"] }).demarrerConversation("ACoAAB12cd", "t")).toEqual({
      ok: true,
      donnees: { chatId: "c", messageId: "m1" },
    });
  });
});
