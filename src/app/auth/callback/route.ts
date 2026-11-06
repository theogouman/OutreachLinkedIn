import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { cheminDeRetourSur } from "@/lib/redirection";

/**
 * Retour de Google (via Supabase, flux PKCE) : échange le code contre une session.
 * L'origine de redirection vient de l'URL de la requête, jamais d'un en-tête
 * modifiable (x-forwarded-host), et le chemin de retour est validé.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const retour = cheminDeRetourSur(searchParams.get("retour"));

  if (code) {
    const supabase = await creerClientServeur();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${retour}`);
    console.error("[auth] échange du code impossible", error.code ?? error.status);
  }
  return NextResponse.redirect(`${origin}/login?erreur=connexion`);
}
