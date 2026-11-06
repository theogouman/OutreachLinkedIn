import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { jetonBearer, secretsEgaux, verifierSignatureUnipile } from "./secrets";

const SECRET = "secret-webhook-de-test";
const CORPS = '{"id":"evt_1","type":"relation.new"}';
const T = 1_793_980_800; // instant fixe
const signer = (t: number, corps = CORPS, secret = SECRET) =>
  `t=${t},v0=${createHmac("sha256", secret).update(`${t}.${corps}`).digest("hex")}`;

describe("signature des webhooks Unipile", () => {
  it("accepte une signature valide et récente", () => {
    expect(verifierSignatureUnipile(signer(T), CORPS, SECRET, T * 1000)).toBe(true);
  });

  it.each([
    ["sans en-tête", null],
    ["signature d'un autre corps", signer(T, '{"id":"evt_2"}')],
    ["mauvais secret", signer(T, CORPS, "autre-secret")],
    ["format invalide", "v0=abc"],
    ["hex de mauvaise longueur", `t=${T},v0=abcd`],
  ])("rejette : %s", (_, entete) => {
    expect(verifierSignatureUnipile(entete, CORPS, SECRET, T * 1000)).toBe(false);
  });

  it("rejette un webhook rejoué au-delà de 5 minutes", () => {
    expect(verifierSignatureUnipile(signer(T), CORPS, SECRET, (T + 301) * 1000)).toBe(false);
    expect(verifierSignatureUnipile(signer(T), CORPS, SECRET, (T + 299) * 1000)).toBe(true);
  });
});

describe("secret du worker", () => {
  it("compare les secrets", () => {
    expect(secretsEgaux("abc", "abc")).toBe(true);
    expect(secretsEgaux("abd", "abc")).toBe(false);
    expect(secretsEgaux(null, "abc")).toBe(false);
    expect(secretsEgaux("", "abc")).toBe(false);
  });
  it("lit le jeton Bearer", () => {
    expect(jetonBearer("Bearer xyz")).toBe("xyz");
    expect(jetonBearer("Basic xyz")).toBeNull();
    expect(jetonBearer(null)).toBeNull();
  });
});
