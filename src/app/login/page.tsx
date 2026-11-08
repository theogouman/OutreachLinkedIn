import { Suspense } from "react";
import type { Metadata } from "next";
import { BoutonGoogle } from "./bouton-google";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Connexion · Prospection LinkedIn" };

export default function PageConnexion() {
  return (
    <main className="relative flex min-h-dvh flex-col">
      <div className="fond-app" aria-hidden />
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center gap-10 px-4 pb-[calc(env(safe-area-inset-bottom)+64px)] pt-[calc(env(safe-area-inset-top)+64px)]">
        <header className="flex flex-col items-center gap-6 text-center">
          <Logo taille={72} />
          <h1 className="text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-[-0.02em] text-encre">
            Ton suivi de prospection LinkedIn
          </h1>
        </header>
        <div className="carte-lisere w-full entree">
          <div className="flex flex-col gap-6 p-8">
            <p className="body-6 text-encre-2">Accès réservé aux comptes Google autorisés.</p>
            <Suspense>
              <BoutonGoogle />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
