import { Suspense } from "react";
import type { Metadata } from "next";
import { BoutonGoogle } from "./bouton-google";

export const metadata: Metadata = { title: "Connexion — Prospection LinkedIn" };

export default function PageConnexion() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="carte relative w-full max-w-[400px] animate-apparition p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-action text-white shadow-[0_6px_16px_-6px_rgb(181_68_61/0.6)]" aria-hidden>
          <svg viewBox="0 0 256 256" className="size-5" fill="currentColor">
            <path d="M216 24H40a16 16 0 0 0-16 16v176a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V40a16 16 0 0 0-16-16ZM96 176a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Zm-8-88a12 12 0 1 1 12-12 12 12 0 0 1-12 12Zm96 88a8 8 0 0 1-16 0v-36a20 20 0 0 0-40 0v36a8 8 0 0 1-16 0v-64a8 8 0 0 1 15.79-1.78A36 36 0 0 1 184 140Z" />
          </svg>
        </span>
        <h1 className="mt-6 heading-5 text-encre">Prospection LinkedIn</h1>
        <p className="mt-1 mb-8 body-6 text-encre-3">Accès réservé. Connecte-toi avec ton compte Google autorisé.</p>
        <Suspense>
          <BoutonGoogle />
        </Suspense>
      </div>
    </main>
  );
}
