import Link from "next/link";
import { Chiffre } from "@/components/interface/elements";
import type { StatsProspects } from "@/server/donnees";

/**
 * Indicateurs clés (déplacés de la page Prospects) : chaque carte ouvre la liste déjà filtrée
 * (?statut=, ?relance=dues) ou l'Inbox sur les réponses à traiter. 2 colonnes sur téléphone.
 */
export function Indicateurs({ stats }: { stats: StatsProspects }) {
  const cartes = [
    { libelle: "En relation", valeur: stats.parStatut.en_relation, aide: `sur ${stats.total} prospects`, href: "/?statut=en_relation" },
    { libelle: "Invitations en attente", valeur: stats.parStatut.en_attente, aide: "acceptation non reçue", href: "/?statut=en_attente" },
    { libelle: "Réponses à traiter", valeur: stats.aTraiter, aide: "dernier message reçu", href: "/inbox?filtre=a_traiter", accent: stats.aTraiter > 0 },
    { libelle: "Relances dues", valeur: stats.relancesDues, aide: "aujourd'hui ou en retard", href: "/?relance=dues", accent: stats.relancesDues > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cartes.map((c) => (
        <Link
          key={c.libelle}
          href={c.href}
          className="carte flex min-w-0 flex-col gap-2 p-4 text-left outline-none transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-creux focus-visible:shadow-[0_0_0_3px_rgba(224,98,90,0.35)] sm:gap-3 sm:p-5"
        >
          <span className="body-6 text-encre-2">{c.libelle}</span>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Chiffre valeur={c.valeur} className={`chiffre-cle ${c.accent ? "text-rouge" : "text-encre"}`} />
            <span className="caption-5 text-encre-3">{c.aide}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
