import { z } from "zod";

/**
 * Variables exposées au navigateur. Seules les variables NEXT_PUBLIC_ y figurent,
 * et jamais une clé privée (service role, clé API tierce…).
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Valide les variables publiques à l'usage, pas à l'import, pour que le build
 * et la CI tournent sans secrets. Le message d'erreur nomme les variables
 * manquantes sans jamais afficher leur valeur.
 */
export function getPublicEnv(source: Record<string, string | undefined> = process.env): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Variables d'environnement invalides ou manquantes : ${names.join(", ")}`);
  }
  return parsed.data;
}
