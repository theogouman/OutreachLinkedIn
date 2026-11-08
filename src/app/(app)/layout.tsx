import { Suspense } from "react";
import Link from "next/link";
import { JaugeQuotas } from "@/components/jauge-quotas";
import { BoutonArret } from "@/components/bouton-arret";
import { MenuStatuts } from "@/components/menu-statuts";
import { Navigation } from "@/components/navigation";
import { Coque } from "@/components/coque";
import { Logo } from "@/components/logo";
import { IconeDeconnexion } from "@/components/icones";
import { etatOutil } from "@/server/donnees";
import { exigerUtilisateur } from "@/server/auth";
import { seDeconnecter } from "../actions-auth";

/* Coque reprise de kargulstudio/sales-crm : barre latérale, en-tête compact, contenu pleine largeur. */
export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <Coque
      barre={<BarreLaterale />}
      pastille={
        <Suspense fallback={null}>
          <PastilleDemo />
        </Suspense>
      }
      entete={
        <Suspense fallback={<span className="squelette block h-[30px] w-[70px] rounded-full" />}>
          <Actions />
        </Suspense>
      }
    >
      {children}
    </Coque>
  );
}

function BarreLaterale() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 border-b border-trait bg-[#181818] p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
      >
        <Logo taille={32} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="block truncate text-[14px] font-medium leading-none tracking-[-0.01em] text-encre">Prospection</span>
          <span className="block truncate caption-4 leading-none text-encre-3">Pipeline LinkedIn</span>
        </span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<SqueletteNav />}>
          <NavigationAvecComptes />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <Compte />
      </Suspense>
    </div>
  );
}

function SqueletteNav() {
  return (
    <div className="flex flex-col gap-1 p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="squelette h-[30px] w-full rounded-lg" />
      ))}
    </div>
  );
}

async function NavigationAvecComptes() {
  const etat = await etatOutil();
  return <Navigation comptes={{ nonLus: etat.nonLus, enAttente: etat.enAttente }} />;
}

async function PastilleDemo() {
  const etat = await etatOutil();
  if (!etat.modeSimule) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#363636] bg-muet py-[3px] pl-[5px] pr-[7px] caption-4 leading-none text-encre"
      title="Aucune action n'est envoyée à LinkedIn tant qu'Unipile n'est pas branché."
    >
      <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
      Mode démo
    </span>
  );
}

/** Pied de la barre latérale : compte connecté et déconnexion. */
async function Compte() {
  const u = await exigerUtilisateur();
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-trait bg-[#181818] p-4">
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="block text-[14px] font-medium leading-none text-encre">Connecté</span>
        <span className="block truncate caption-4 leading-none text-encre-3">{u.email}</span>
      </span>
      <form action={seDeconnecter}>
        <button type="submit" className="bouton bouton-muet bouton-md" aria-label="Se déconnecter" title="Se déconnecter">
          <IconeDeconnexion taille={14} />
        </button>
      </form>
    </div>
  );
}

/** Droite de l'en-tête : menu Statuts (point clignotant, ouvert au survol) puis déconnexion. */
async function Actions() {
  const [etat] = await Promise.all([etatOutil(), exigerUtilisateur()]);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <MenuStatuts etatFile={etat.etatFile} alerte={etat.incertaines > 0 || etat.arretDurgence}>
        <div className="flex flex-col gap-4">
          <JaugeQuotas etat={etat} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-trait pt-4">
            {etat.modeSimule ? <span className="tag ton-ambre">Mode démo</span> : <span />}
            <BoutonArret arret={etat.arretDurgence} />
          </div>
        </div>
      </MenuStatuts>
      <form action={seDeconnecter}>
        <button type="submit" className="bouton bouton-icone" aria-label="Se déconnecter" title="Se déconnecter">
          <IconeDeconnexion taille={14} />
        </button>
      </form>
    </div>
  );
}
