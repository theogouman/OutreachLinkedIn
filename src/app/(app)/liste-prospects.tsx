"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TableTriable, type Colonne } from "@/components/interface/table-triable";
import { ControleSegmente } from "@/components/interface/controle-segmente";
import { Avatar } from "@/components/interface/elements";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import type { LigneProspect, StatsProspects } from "@/server/donnees";

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

function libelleRelance(date: string | null) {
  if (!date) return { texte: "—", retard: false };
  const d = new Date(`${date}T12:00:00Z`);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return { texte: date === aujourdhui ? "Aujourd'hui" : fmt.format(d), retard: date <= aujourdhui };
}

/** Filtre de statut (contrôle segmenté) : met à jour l'URL, le filtrage reste côté serveur. */
export function FiltreStatut({ stats }: { stats: StatsProspects }) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const valeur = params.get("statut") ?? "tous";
  return (
    <ControleSegmente
      libelle="Filtrer par statut de relation"
      valeur={valeur}
      onChange={(v) => {
        const q = new URLSearchParams(params);
        if (v === "tous") q.delete("statut");
        else q.set("statut", v);
        q.delete("page");
        router.push(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
      }}
      options={[
        { valeur: "tous", libelle: "Tous", compte: stats.total },
        { valeur: "en_relation", libelle: "En relation", compte: stats.parStatut.en_relation },
        { valeur: "en_attente", libelle: "En attente", compte: stats.parStatut.en_attente },
        { valeur: "invitation_recue", libelle: "Reçues", compte: stats.parStatut.invitation_recue },
        { valeur: "a_inviter", libelle: "À inviter", compte: stats.parStatut.a_inviter },
      ]}
    />
  );
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
      largeur: "minmax(220px, 2fr)",
      valeur: (p) => `${p.nom ?? ""} ${p.prenom ?? ""}`,
      cellule: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nom={nom(p)} />
          <div className="min-w-0">
            <p className="truncate title-4 text-encre">{nom(p)}</p>
            <p className="truncate caption-5 text-encre-3">{p.poste ?? "Poste inconnu"}</p>
          </div>
        </div>
      ),
    },
    { id: "entreprise", entete: "Entreprise", largeur: "minmax(140px, 1.2fr)", valeur: (p) => p.entreprise, cellule: (p) => <span className="block truncate text-encre-2">{p.entreprise ?? "—"}</span> },
    { id: "relation", entete: "Relation", largeur: "150px", valeur: (p) => p.statutRelation, cellule: (p) => <BadgeStatut statut={p.statutRelation} /> },
    { id: "etape", entete: "Étape", largeur: "150px", valeur: (p) => etapes[p.etape] ?? p.etape, cellule: (p) => <BadgeEtape libelle={etapes[p.etape] ?? p.etape} /> },
    {
      id: "relance",
      entete: "Relance",
      largeur: "110px",
      valeur: (p) => p.prochaineRelance,
      cellule: (p) => {
        const r = libelleRelance(p.prochaineRelance);
        return <span className={`caption-4 ${r.retard ? "text-action" : "text-encre-3"}`}>{r.texte}</span>;
      },
    },
    { id: "liste", entete: "Liste", largeur: "minmax(120px, 1fr)", valeur: (p) => p.listeOrigine, cellule: (p) => <span className="block truncate caption-5 text-encre-3">{p.listeOrigine ?? "—"}</span> },
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
