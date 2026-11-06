import { Suspense } from "react";
import { exigerUtilisateur } from "@/server/auth";
import { seDeconnecter } from "./actions-auth";

export default function Accueil() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <EnTete />
      </Suspense>
      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Phase 1 en cours</h2>
        <p className="text-sm text-neutral-600">
          Le CRM, la file d&apos;attente et la jauge de quotas arrivent dans les prochaines étapes.
        </p>
      </section>
    </main>
  );
}

async function EnTete() {
  const utilisateur = await exigerUtilisateur();
  return (
    <header className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">Prospection LinkedIn</h1>
      <form action={seDeconnecter} className="flex items-center gap-3 text-sm">
        <span className="text-neutral-600">{utilisateur.email}</span>
        <button type="submit" className="rounded-lg px-3 py-1.5 text-[#e0625a] hover:bg-white">
          Se déconnecter
        </button>
      </form>
    </header>
  );
}
