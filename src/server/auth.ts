import "server-only";
import { redirect } from "next/navigation";
import { creerClientServeur } from "@/lib/supabase/server";

export interface UtilisateurAutorise {
  email: string;
}

/**
 * Couche d'accès : vérifie la session (getClaims, signature du jeton vérifiée)
 * ET l'autorisation. L'autorisation repose sur la RLS : seule une adresse de
 * `utilisateurs_autorises` voit la ligne de réglages. Une seule source de vérité.
 */
export async function exigerUtilisateur(): Promise<UtilisateurAutorise> {
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (error || !email) redirect("/login");

  const { data: reglages, error: erreurAcces } = await supabase.from("reglages").select("id").maybeSingle();
  if (erreurAcces) {
    console.error("[auth] vérification d'accès impossible", erreurAcces.code);
    redirect("/login?erreur=technique");
  }
  if (!reglages) {
    await supabase.auth.signOut();
    redirect("/login?erreur=acces");
  }
  return { email };
}
