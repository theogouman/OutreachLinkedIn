import { describe, expect, it, vi } from "vitest";
import { TAILLE_MAX_PHOTO, telechargerPhoto } from "./photo";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const reponse = (corps: Buffer | string, entetes: Record<string, string> = {}, status = 200) =>
  vi.fn(async () => new Response(typeof corps === "string" ? corps : new Uint8Array(corps), { status, headers: entetes }));

describe("photo de profil LinkedIn", () => {
  it("télécharge une image JPEG depuis le CDN LinkedIn", async () => {
    const f = reponse(JPEG, { "content-type": "image/jpeg" });
    const p = await telechargerPhoto("https://media.licdn.com/dms/image/abc/profile.jpg?e=1", f as unknown as typeof fetch);
    expect(p).toEqual({ contenu: JPEG, type: "image/jpeg" });
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "error" });
  });

  it("refuse tout autre hôte, http, port ou identifiants (pas de requête)", async () => {
    const f = reponse(JPEG);
    for (const u of [
      "https://evil.example/x.jpg",
      "https://licdn.com.evil.example/x.jpg",
      "http://media.licdn.com/x.jpg",
      "https://media.licdn.com:8443/x.jpg",
      "https://u:p@media.licdn.com/x.jpg",
      "file:///etc/passwd",
      "pas une url",
    ]) {
      expect(await telechargerPhoto(u, f as unknown as typeof fetch)).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("refuse un contenu qui n'est pas une image, trop lourd, ou une erreur", async () => {
    const u = "https://media.licdn.com/x";
    expect(await telechargerPhoto(u, reponse("<svg onload=alert(1)>", { "content-type": "image/jpeg" }) as unknown as typeof fetch)).toBeNull();
    expect(await telechargerPhoto(u, reponse(Buffer.concat([JPEG, Buffer.alloc(TAILLE_MAX_PHOTO)])) as unknown as typeof fetch)).toBeNull();
    expect(await telechargerPhoto(u, reponse(JPEG, {}, 404) as unknown as typeof fetch)).toBeNull();
    const panne = vi.fn(async () => {
      throw new Error("réseau");
    });
    expect(await telechargerPhoto(u, panne as unknown as typeof fetch)).toBeNull();
  });
});
