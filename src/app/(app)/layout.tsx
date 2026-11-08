import { Suspense } from "react";
import { JaugeQuotas } from "@/components/jauge-quotas";
import { BoutonArret } from "@/components/bouton-arret";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Logo } from "@/components/logo";
import { IconeDeconnexion } from "@/components/icones";
import { etatOutil } from "@/server/donnees";
import { exigerUtilisateur } from "@/server/auth";
import { seDeconnecter } from "../actions-auth";

/*
 * Coque de l'application, DA Notion Club : fond à taches latérales, barre de navigation
 * en pilule flottante (desktop) et barre de pouce en bas (mobile).
 */
export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <div className="fond-app" aria-hidden />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-carte focus:px-4 focus:py-2 focus:body-5 focus:shadow"
      >
        Aller au contenu
      </a>

      {/* Barre flottante (écran moyen et plus) */}
      <header className="fixed inset-x-0 top-0 z-40 hidden justify-center px-6 pt-[calc(env(safe-area-inset-top)+14px)] md:flex lg:px-10">
        <div className="flottant flex w-full max-w-[1080px] items-center justify-between gap-6 rounded-full py-2 pl-2.5 pr-2">
          <div className="flex min-w-0 items-center gap-4">
            <Marque />
            <span aria-hidden className="h-[22px] w-px shrink-0 bg-trait" />
            <Suspense fallback={<SqueletteNav />}>
              <NavigationAvecComptes variante="haut" />
            </Suspense>
          </div>
          <Suspense fallback={<span className="squelette block size-9 rounded-full" />}>
            <Compte />
          </Suspense>
        </div>
      </header>

      {/* En-tête mobile */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] md:hidden">
        <Marque />
        <Suspense fallback={null}>
          <Compte />
        </Suspense>
      </div>

      <main id="contenu" className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 pb-32 pt-4 md:px-6 md:pb-16 md:pt-[calc(env(safe-area-inset-top)+104px)] lg:px-0">
        <Suspense fallback={<span className="squelette block h-[76px] w-full rounded-[24px]" />}>
          <Etat />
        </Suspense>
        {children}
      </main>

      {/* Barre de pouce (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] md:hidden">
        <div className="flottant rounded-full px-2 py-1.5">
          <Suspense fallback={<span className="squelette block h-11 w-full rounded-full" />}>
            <NavigationAvecComptes variante="bas" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function Marque() {
  return (
    <Link href="/" aria-label="Prospection, accueil" className="shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <Logo taille={36} />
    </Link>
  );
}

function SqueletteNav() {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="squelette h-9 w-24 rounded-full" />
      ))}
    </div>
  );
}

async function NavigationAvecComptes({ variante }: { variante: "haut" | "bas" }) {
  const etat = await etatOutil();
  return <Navigation variante={variante} comptes={{ nonLus: etat.nonLus, enAttente: etat.enAttente }} />;
}

async function Etat() {
  const etat = await etatOutil();
  return (
    <div className="carte flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
      <JaugeQuotas etat={etat} />
      <div className="ml-auto flex items-center gap-3">
        {etat.modeSimule && (
          <span
            className="rounded-full bg-amber-50 px-2.5 py-1 caption-4 text-amber-800 ring-1 ring-inset ring-amber-200"
            title="Aucune action n'est envoyée à LinkedIn tant qu'Unipile n'est pas branché."
          >
            Mode démo
          </span>
        )}
        <BoutonArret arret={etat.arretDurgence} />
      </div>
    </div>
  );
}

async function Compte() {
  await exigerUtilisateur();
  return (
    <form action={seDeconnecter}>
      <button type="submit" className="bouton bouton-discret size-9 p-0" aria-label="Se déconnecter" title="Se déconnecter">
        <IconeDeconnexion taille={18} />
      </button>
    </form>
  );
}
