import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Comparaison à temps constant de deux secrets (empreintes de même longueur). */
export function secretsEgaux(fourni: string | null | undefined, attendu: string): boolean {
  if (!fourni) return false;
  const a = createHash("sha256").update(fourni).digest();
  const b = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(a, b);
}

/** En-tête « Authorization: Bearer <secret> ». */
export function jetonBearer(entete: string | null): string | null {
  const m = /^Bearer (.+)$/.exec(entete ?? "");
  return m ? m[1]! : null;
}

export const TOLERANCE_WEBHOOK_S = 300;

/**
 * Signature Unipile v2 : en-tête `unipile-signature: t=<secondes>,v0=<hex>`,
 * v0 = HMAC-SHA256(secret, `${t}.${corpsBrut}`). Horodatage à ±5 min.
 */
export function verifierSignatureUnipile(entete: string | null, corpsBrut: string, secret: string, maintenantMs = Date.now()): boolean {
  if (!entete) return false;
  const parties = Object.fromEntries(
    entete.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parties.t);
  const v0 = parties.v0;
  if (!Number.isInteger(t) || !v0 || !/^[0-9a-f]{64}$/i.test(v0)) return false;
  if (Math.abs(maintenantMs / 1000 - t) > TOLERANCE_WEBHOOK_S) return false;
  const attendu = createHmac("sha256", secret).update(`${t}.${corpsBrut}`).digest();
  return timingSafeEqual(Buffer.from(v0, "hex"), attendu);
}
