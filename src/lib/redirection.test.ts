import { describe, expect, it } from "vitest";
import { cheminDeRetourSur } from "./redirection";

describe("cheminDeRetourSur", () => {
  it.each([
    ["/crm", "/crm"],
    ["/crm?etape=connecte", "/crm?etape=connecte"],
    ["/", "/"],
  ])("accepte %s", (entree, attendu) => {
    expect(cheminDeRetourSur(entree)).toBe(attendu);
  });

  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "crm", "/\u0000", "/a\nb"])(
    "rejette %s",
    (entree) => {
      expect(cheminDeRetourSur(entree)).toBe("/");
    },
  );

  it("garde un chemin encodé tel quel, sans en faire une URL externe", () => {
    const r = cheminDeRetourSur("/%2F%2Fevil.com");
    expect(r.startsWith("/")).toBe(true);
    expect(r.startsWith("//")).toBe(false);
  });
});
