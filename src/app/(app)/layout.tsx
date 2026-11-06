import { Suspense } from "react";
import Link from "next/link";
import { JaugeQuotas } from "@/components/jauge-quotas";
import { BoutonArret } from "@/components/bouton-arret";
import { etatOutil } from "@/server/donnees";
import { exigerUtilisateur } from "@/server/auth";
import { seDeconnecter } from "../actions-auth";

const NAV = [
  { href: "/", libelle: "Prospects" },
  { href: "/file", libelle: "File d'attente" },
  { href: "/import", libelle: "Import" },
  { href: "/reglages", libelle: "Réglages" },
] as const;

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-[#f5f2f2]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-1 text-sm">
            <span className="mr-3 font-semibold">Prospection</span>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-neutral-700 hover:bg-white">
                {n.libelle}
              </Link>
            ))}
          </nav>
          <Suspense fallback={<div className="h-8" />}>
            <Compte />
          </Suspense>
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 pb-3">
          <Suspense fallback={<div className="h-9" />}>
            <Etat />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

async function Etat() {
  const etat = await etatOutil();
  return (
    <div className="flex flex-col gap-2">
      {etat.modeSimule && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          Mode démo : Unipile n&apos;est pas branché, aucune action n&apos;est envoyée à LinkedIn.
          {etat.prospectsDemo > 0 ? ` ${etat.prospectsDemo} prospects fictifs affichés.` : " Charge des données fictives dans Réglages."}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <JaugeQuotas etat={etat} />
        <BoutonArret arret={etat.arretDurgence} />
      </div>
    </div>
  );
}

async function Compte() {
  const u = await exigerUtilisateur();
  return (
    <form action={seDeconnecter} className="flex items-center gap-3 text-sm">
      <span className="hidden text-neutral-600 sm:inline">{u.email}</span>
      <button type="submit" className="rounded-lg px-3 py-1.5 text-[#b3403a] hover:bg-white">
        Se déconnecter
      </button>
    </form>
  );
}
