import { Suspense } from "react";
import type { Metadata } from "next";
import { BoutonGoogle } from "./bouton-google";

export const metadata: Metadata = { title: "Connexion — Prospection LinkedIn" };

export default function PageConnexion() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f2f2] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Prospection LinkedIn</h1>
        <p className="mb-6 text-sm text-neutral-600">Accès réservé.</p>
        <Suspense>
          <BoutonGoogle />
        </Suspense>
      </div>
    </main>
  );
}
