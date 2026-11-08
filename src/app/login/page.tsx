import { Suspense } from "react";
import type { Metadata } from "next";
import { BoutonGoogle } from "./bouton-google";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Connexion · Prospection LinkedIn" };

export default function PageConnexion() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+48px)] pt-[calc(env(safe-area-inset-top)+48px)]">
      <div className="flex w-full max-w-[380px] animate-apparition flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <Logo taille={56} />
          <div className="flex flex-col gap-2">
            <h1 className="heading-6 text-encre">Prospection LinkedIn</h1>
            <p className="caption-4 text-encre-3">Accès réservé aux comptes Google autorisés.</p>
          </div>
        </header>
        <div className="carte flex flex-col gap-4 p-5">
          <Suspense>
            <BoutonGoogle />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
