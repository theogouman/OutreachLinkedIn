import { Suspense } from "react";
import { JaugeQuotas } from "@/components/jauge-quotas";
import { BoutonArret } from "@/components/bouton-arret";
import { Navigation } from "@/components/navigation";
import { IconeDeconnexion, IconeLinkedIn } from "@/components/icones";
import { etatOutil } from "@/server/donnees";
import { exigerUtilisateur } from "@/server/auth";
import { seDeconnecter } from "../actions-auth";

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-carte focus:px-3 focus:py-2 focus:body-5 focus:shadow"
      >
        Aller au contenu
      </a>

      {/* Colonne de navigation (écran large) */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 px-4 py-6 lg:flex">
        <Marque />
        <Suspense fallback={<SqueletteNav />}>
          <NavigationAvecComptes />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<span className="squelette block h-10 w-full" />}>
            <Compte />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 bg-surface/85 px-4 pb-3 pt-4 backdrop-blur-md lg:px-8">
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <Marque />
            <Suspense fallback={null}>
              <Compte compact />
            </Suspense>
          </div>
          <div className="mb-3 lg:hidden">
            <Suspense fallback={<span className="squelette block h-9 w-full" />}>
              <NavigationAvecComptes horizontale />
            </Suspense>
          </div>
          <Suspense fallback={<span className="squelette block h-[68px] w-full rounded-2xl" />}>
            <Etat />
          </Suspense>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-4 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Marque() {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="grid size-9 place-items-center rounded-xl bg-action text-white shadow-[0_1px_2px_rgba(28,25,23,0.2)]">
        <IconeLinkedIn taille={20} />
      </span>
      <div className="leading-tight">
        <p className="title-4 text-encre">Prospection</p>
        <p className="caption-5 text-encre-3">LinkedIn · Théo</p>
      </div>
    </div>
  );
}

function SqueletteNav() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="squelette h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

async function NavigationAvecComptes({ horizontale = false }: { horizontale?: boolean }) {
  const etat = await etatOutil();
  return <Navigation horizontale={horizontale} comptes={{ nonLus: etat.nonLus, enAttente: etat.enAttente }} />;
}

async function Etat() {
  const etat = await etatOutil();
  return (
    <div className="carte flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <JaugeQuotas etat={etat} />
      <div className="ml-auto flex items-center gap-3">
        {etat.modeSimule && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 caption-4 text-amber-800 ring-1 ring-inset ring-amber-200" title="Aucune action n'est envoyée à LinkedIn tant qu'Unipile n'est pas branché.">
            Mode démo
          </span>
        )}
        <BoutonArret arret={etat.arretDurgence} />
      </div>
    </div>
  );
}

async function Compte({ compact = false }: { compact?: boolean }) {
  const u = await exigerUtilisateur();
  return (
    <form action={seDeconnecter} className="flex items-center gap-2">
      {!compact && <span className="min-w-0 flex-1 truncate caption-5 text-encre-3">{u.email}</span>}
      <button type="submit" className="bouton bouton-discret px-2" aria-label="Se déconnecter" title="Se déconnecter">
        <IconeDeconnexion taille={18} />
      </button>
    </form>
  );
}
