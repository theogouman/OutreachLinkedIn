import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

/**
 * Client Supabase côté serveur, lié aux cookies de la requête (session de
 * l'utilisateur, soumis à la RLS). À appeler sous un <Suspense> (cacheComponents).
 */
export async function creerClientServeur() {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un Server Component : écriture impossible, le proxy rafraîchit la session.
        }
      },
    },
  });
}
