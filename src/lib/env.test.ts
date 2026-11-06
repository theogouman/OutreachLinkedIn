import { describe, expect, it } from "vitest";
import { getPublicEnv } from "./env";

describe("getPublicEnv", () => {
  it("renvoie les variables publiques valides", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("nomme les variables manquantes", () => {
    expect(() => getPublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("n'affiche jamais la valeur d'une variable invalide", () => {
    const secretLooking = "not-a-url-but-a-secret-value";
    expect(() =>
      getPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: secretLooking, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "x" }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining(secretLooking) }));
  });

  it("ignore les variables privées présentes dans l'environnement", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_should_not_leak",
    });
    expect(Object.keys(env)).not.toContain("SUPABASE_SECRET_KEY");
  });
});
