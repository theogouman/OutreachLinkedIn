import { afterEach, describe, expect, it } from "vitest";
import { envWebhook } from "./env-serveur";

const avant = process.env.UNIPILE_WEBHOOK_SECRET;
afterEach(() => {
  if (avant === undefined) delete process.env.UNIPILE_WEBHOOK_SECRET;
  else process.env.UNIPILE_WEBHOOK_SECRET = avant;
});

describe("configuration des webhooks", () => {
  it("un secret absent, vide ou provisoire (trop court) est ignoré, sans erreur", () => {
    for (const v of [undefined, "", "a-remplir"]) {
      if (v === undefined) delete process.env.UNIPILE_WEBHOOK_SECRET;
      else process.env.UNIPILE_WEBHOOK_SECRET = v;
      expect(envWebhook().UNIPILE_WEBHOOK_SECRET).toBeUndefined();
    }
  });

  it("un secret valide est utilisé", () => {
    process.env.UNIPILE_WEBHOOK_SECRET = "un-secret-suffisamment-long";
    expect(envWebhook().UNIPILE_WEBHOOK_SECRET).toBe("un-secret-suffisamment-long");
  });
});
