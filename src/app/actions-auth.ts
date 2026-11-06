"use server";

import { redirect } from "next/navigation";
import { creerClientServeur } from "@/lib/supabase/server";

/** Déconnexion (Server Action : protégée contre les requêtes d'une autre origine par Next.js). */
export async function seDeconnecter() {
  const supabase = await creerClientServeur();
  await supabase.auth.signOut();
  redirect("/login");
}
