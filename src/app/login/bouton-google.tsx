"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { cheminDeRetourSur } from "@/lib/redirection";

const MESSAGES: Record<string, string> = {
  acces: "Ce compte Google n'est pas autorisé à utiliser l'outil.",
  connexion: "La connexion a échoué. Réessaie.",
  technique: "Une erreur est survenue. Réessaie dans un instant.",
};

export function BoutonGoogle() {
  const params = useSearchParams();
  const [enCours, setEnCours] = useState(false);
  const [erreurLocale, setErreurLocale] = useState(false);
  const erreur = params.get("erreur");
  const message = erreurLocale ? MESSAGES.connexion : erreur ? (MESSAGES[erreur] ?? MESSAGES.connexion) : null;

  async function seConnecter() {
    setEnCours(true);
    setErreurLocale(false);
    const retour = cheminDeRetourSur(params.get("retour"));
    const callback = new URL("/auth/callback", window.location.origin);
    if (retour !== "/") callback.searchParams.set("retour", retour);
    const { error } = await creerClientNavigateur().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setEnCours(false);
      setErreurLocale(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="rounded-lg bg-white px-4 py-3 text-sm text-[#b3403a]">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={seConnecter}
        disabled={enCours}
        className="rounded-lg bg-[#b5443d] px-5 py-3 font-medium text-white transition hover:bg-[#9c3a34] disabled:opacity-60"
      >
        {enCours ? "Redirection vers Google…" : "Se connecter avec Google"}
      </button>
    </div>
  );
}
