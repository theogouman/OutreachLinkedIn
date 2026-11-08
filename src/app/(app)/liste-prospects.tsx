"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TableTriable, type Colonne } from "@/components/interface/table-triable";
import { Avatar } from "@/components/interface/elements";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import type { LigneProspect } from "@/server/donnees";

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

function libelleRelance(date: string | null) {
  if (!date) return { texte: "—", retard: false };
  const d = new Date(`${date}T12:00:00Z`);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return { texte: date === aujourdhui ? "Aujourd'hui" : fmt.format(d), retard: date <= aujourdhui };
}

export function TableProspects({ lignes, etapes }: { lignes: LigneProspect[]; etapes: Record<string, string> }) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const nom = (p: LigneProspect) => [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom";

  const colonnes: Colonne<LigneProspect>[] = [
    {
      id: "nom",
      entete: "Prospect",
      largeur: "minmax(180px, 1.4fr)",
      valeur: (p) => `${p.nom ?? ""} ${p.prenom ?? ""}`,
      cellule: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar nom={nom(p)} taille={20} />
          <span className="truncate">{nom(p)}</span>
        </span>
      ),
    },
    { id: "poste", entete: "Poste", largeur: "minmax(160px, 1.4fr)", valeur: (p) => p.poste, cellule: (p) => <span className="block truncate text-encre-2">{p.poste ?? "—"}</span> },
    { id: "entreprise", entete: "Entreprise", largeur: "minmax(120px, 1fr)", valeur: (p) => p.entreprise, cellule: (p) => <span className="block truncate">{p.entreprise ?? "—"}</span> },
    { id: "relation", entete: "Relation", largeur: "150px", valeur: (p) => p.statutRelation, cellule: (p) => <BadgeStatut statut={p.statutRelation} /> },
    { id: "etape", entete: "Étape", largeur: "150px", valeur: (p) => etapes[p.etape] ?? p.etape, cellule: (p) => <BadgeEtape libelle={etapes[p.etape] ?? p.etape} /> },
    {
      id: "relance",
      entete: "Relance",
      largeur: "100px",
      valeur: (p) => p.prochaineRelance,
      cellule: (p) => {
        const r = libelleRelance(p.prochaineRelance);
        return <span className={r.retard ? "text-accent" : "text-encre-2"}>{r.texte}</span>;
      },
    },
    { id: "liste", entete: "Liste", largeur: "minmax(120px, 1fr)", valeur: (p) => p.listeOrigine, cellule: (p) => <span className="block truncate text-encre-2">{p.listeOrigine ?? "—"}</span> },
  ];

  return (
    <TableTriable
      lignes={lignes}
      colonnes={colonnes}
      idDe={(p) => p.id}
      libelle="Prospects"
      surLigne={(p) => {
        const q = new URLSearchParams(params);
        q.set("prospect", p.id);
        router.push(`${chemin}?${q}`, { scroll: false });
      }}
    />
  );
}
