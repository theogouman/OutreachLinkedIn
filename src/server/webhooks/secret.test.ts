import { beforeEach, describe, expect, it, vi } from "vitest";
import { secretsWebhookUnipile, viderCacheSecretsWebhook } from "./secret";

const OPTS = { apiKey: "cle-api", baseUrl: "https://api.example.test", chemin: "/api/webhooks/unipile", maintenant: 1_000_000 };
const reponse = (corps: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corps), { status }));

describe("secret des webhooks Unipile, lu par le serveur", () => {
  beforeEach(() => viderCacheSecretsWebhook());

  it("lit le secret du point de terminaison de ce site, avec la clé API, et le garde en cache", async () => {
    const f = reponse({
      object: "WebhookEndpoints",
      data: [
        { id: "we_1", url: "https://outreach.gouman.fr/api/webhooks/unipile", secret: "secret-du-site-1234", enabled: true },
        { id: "we_2", url: "https://autre.example/hook", secret: "secret-autre-1234", enabled: true },
        { id: "we_3", url: "https://outreach.gouman.fr/api/webhooks/unipile/", secret: "secret-inactif-123", enabled: false },
      ],
    });
    expect(await secretsWebhookUnipile(OPTS, f as unknown as typeof fetch)).toEqual(["secret-du-site-1234"]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v2/webhooks/endpoints/?limit=100");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("cle-api");
    await secretsWebhookUnipile(OPTS, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("en cas d'échec, aucun secret, et pas de nouvel appel pendant une minute", async () => {
    const f = reponse({ type: "errors/unauthorized" }, 401);
    expect(await secretsWebhookUnipile(OPTS, f as unknown as typeof fetch)).toEqual([]);
    expect(await secretsWebhookUnipile({ ...OPTS, maintenant: OPTS.maintenant + 30_000 }, f as unknown as typeof fetch)).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
    await secretsWebhookUnipile({ ...OPTS, maintenant: OPTS.maintenant + 61_000 }, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("réponse inattendue : aucun secret", async () => {
    expect(await secretsWebhookUnipile(OPTS, reponse({ data: [{ id: "x" }] }) as unknown as typeof fetch)).toEqual([]);
  });
});
