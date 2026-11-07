"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { cheminDeRetourSur } from "@/lib/redirection";
import { LogoGoogle } from "@/components/logos";

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
        <p role="alert" className="rounded-[12px] bg-accent-doux px-4 py-3 body-6 text-action">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={seConnecter}
        disabled={enCours}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-dashed border-trait bg-creux px-5 py-3 text-[15px] font-medium text-encre outline-none transition-[background-color,transform,opacity] duration-200 ease-[var(--ease-sortie)] hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <LogoGoogle taille={20} />
        {enCours ? "Redirection vers Google…" : "Se connecter avec Google"}
      </button>
    </div>
  );
}
