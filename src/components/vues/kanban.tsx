"use client";

/*
 * Mise en page « Kanban » (motif ReUI c-kanban-2, composant `@reui/kanban` sur dnd-kit) : une
 * colonne par étape du pipeline, dans l'ordre de la table `etapes`, une carte par prospect de la
 * page affichée (mêmes filtres et même pagination que les autres vues). Glisser une carte dans une
 * autre colonne change l'étape du prospect par le chemin déjà validé (`actionModifierPropriete`,
 * cle « etape » : Zod, transaction, journal « manuel ») ; la carte est déplacée aussitôt, et remise
 * en place si le serveur refuse. Les colonnes ne se réordonnent pas (l'ordre des étapes fait foi).
 * Carte : comme la Galerie (photo, nom, poste, propriétés choisies, sauf l'étape qui fait la colonne) ;
 * un clic l'ouvre, un glissé (10 px à la souris, appui long au doigt, Espace au clavier) la déplace.
 */

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanItem, KanbanItemHandle, KanbanOverlay } from "@/components/reui/kanban";
import { Badge } from "@/components/reui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/interface/elements";
import { useRetour } from "@/components/interface/toasts";
import { actionModifierPropriete } from "@/app/actions";
import { PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";
import type { LigneProspect } from "@/server/donnees";
import { ValeurPropriete, type ContexteProprietes } from "./proprietes";

type Colonnes = Record<string, LigneProspect[]>;

/** Instructions et annonces du glisser au clavier et au lecteur d'écran, en français. */
const ACCESSIBILITE = {
  screenReaderInstructions: {
    draggable:
      "Entrée ouvre la fiche. Espace prend la carte ; flèches gauche et droite pour changer de colonne ; Espace pour la poser ; Échap pour annuler.",
  },
  announcements: {
    onDragStart: () => "Carte prise.",
    onDragOver: ({ over }: { over: { id: string | number } | null }) => (over ? "Carte au-dessus d'une nouvelle position." : undefined),
    onDragEnd: ({ over }: { over: { id: string | number } | null }) => (over ? "Carte posée." : "Carte relâchée hors des colonnes."),
    onDragCancel: () => "Déplacement annulé, la carte reprend sa place.",
  },
};

function colonnesDepuis(lignes: LigneProspect[], etapes: { code: string }[]): Colonnes {
  return Object.fromEntries(etapes.map((e) => [e.code, lignes.filter((p) => p.etape === e.code)]));
}

const nomDe = (p: LigneProspect) => [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom";

function CarteProspect({
  p,
  proprietes,
  ctx,
  ouvrir,
  surcouche = false,
}: {
  p: LigneProspect;
  proprietes: ClePropriete[];
  ctx: ContexteProprietes;
  ouvrir?: (id: string) => void;
  surcouche?: boolean;
}) {
  const nom = nomDe(p);
  const carte = (
    <Card size="sm" className="relative gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:bg-creux/60">
      <CardContent className="flex flex-col gap-3">
        {/* Zone de clic (souris, doigt) ; au clavier, Entrée sur la carte ouvre la fiche. */}
        {ouvrir && <button type="button" tabIndex={-1} aria-hidden onClick={() => ouvrir(p.id)} className="absolute inset-0 rounded-[inherit] outline-none" />}
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar nom={nom} photo={p.photo} taille={32} />
          <div className="min-w-0">
            <p className="truncate body-6 font-medium text-encre">{nom}</p>
            <p className="truncate caption-5 text-encre-3">{p.poste ?? "Poste inconnu"}</p>
          </div>
        </div>
        {proprietes.length > 0 && !surcouche && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 border-t border-trait pt-2.5">
            {proprietes.map((cle) => {
              const def = PROPRIETES_PROSPECTS[cle];
              return (
                <div key={cle} className="contents">
                  <dt className="truncate caption-5 text-encre-3">{def.libelle}</dt>
                  <dd className={`flex min-h-6 min-w-0 items-center caption-4 ${def.modifiable ? "relative z-10" : "pointer-events-none"}`}>
                    <ValeurPropriete cle={cle} prospect={p} ctx={ctx} />
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
  return (
    <KanbanItem
      value={p.id}
      aria-label={`${nom}${p.poste ? `, ${p.poste}` : ""}`}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
      // Entrée ouvre la fiche (intercepté avant le capteur clavier de dnd-kit) ; Espace prend la carte.
      onKeyDownCapture={(e) => {
        if (e.key !== "Enter" || !ouvrir || e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        ouvrir(p.id);
      }}
    >
      {surcouche ? carte : <KanbanItemHandle className="cursor-grab active:cursor-grabbing">{carte}</KanbanItemHandle>}
    </KanbanItem>
  );
}

export function KanbanProspects({
  lignes,
  etapes,
  proprietes,
  ctx,
  ouvrir,
  apresDeplacement,
  vide,
}: {
  lignes: LigneProspect[];
  etapes: { code: string; libelle: string }[];
  proprietes: ClePropriete[];
  ctx: ContexteProprietes;
  ouvrir: (id: string) => void;
  /** Après un changement d'étape enregistré (ex. relire la liste, pour les autres vues). */
  apresDeplacement?: () => void;
  vide?: ReactNode;
}) {
  const retourner = useRetour();
  const [, demarrer] = useTransition();
  const affichees = proprietes.filter((c) => c !== "etape");

  // Colonnes tenues localement pendant le glissé ; reconstruites quand la liste change.
  const signature = `${etapes.map((e) => e.code).join(",")}|${lignes.map((p) => `${p.id}:${p.etape}`).join(",")}`;
  const [colonnes, setColonnes] = useState<Colonnes>(() => colonnesDepuis(lignes, etapes));
  const [signatureVue, setSignatureVue] = useState(signature);
  if (signatureVue !== signature) {
    setSignatureVue(signature);
    setColonnes(colonnesDepuis(lignes, etapes));
  }

  // Un clic qui suit un glissé n'ouvre pas la fiche.
  const glisse = useRef(false);
  const ouvrirSiClic = (id: string) => {
    if (!glisse.current) ouvrir(id);
  };

  if (lignes.length === 0) return <div className="carte grid place-items-center px-6 py-12">{vide}</div>;

  return (
    <Kanban<LigneProspect>
      value={colonnes}
      onValueChange={setColonnes}
      getItemValue={(p) => p.id}
      restoreOnCancel
      accessibility={ACCESSIBILITE}
      onDragStart={() => {
        glisse.current = true;
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          glisse.current = false;
        }, 0);
      }}
      onValueCommit={(_final, meta) => {
        if (meta.kind !== "item" || meta.activeContainer === meta.overContainer) return;
        const id = String(meta.event.active.id);
        demarrer(async () => {
          const r = await actionModifierPropriete({ prospectId: id, cle: "etape", valeur: meta.overContainer }).catch(() => ({
            ok: false as const,
            message: "Connexion impossible : l'étape n'a pas changé.",
          }));
          if (!r.ok) {
            setColonnes(meta.previousValue);
            retourner(r);
            return;
          }
          apresDeplacement?.();
        });
      }}
    >
      <KanbanBoard className="flex auto-rows-auto gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] sm:grid-cols-none">
        {etapes.map((e) => {
          const cartes = colonnes[e.code] ?? [];
          return (
            <KanbanColumn key={e.code} value={e.code} className="w-[296px] shrink-0">
              <Card size="sm" className="h-full bg-creux ring-trait">
                <CardHeader className="flex items-center gap-2">
                  <span className="truncate body-6 font-medium text-encre">{e.libelle}</span>
                  <Badge variant="outline" className="h-5 rounded-full px-1.5 tabular-nums text-encre-2">
                    {cartes.length}
                  </Badge>
                </CardHeader>
                <CardContent className="flex-1">
                  <KanbanColumnContent value={e.code} className="flex min-h-24 flex-col gap-2 p-0.5" aria-label={`Étape ${e.libelle}`}>
                    {cartes.map((p) => (
                      <CarteProspect key={p.id} p={p} proprietes={affichees} ctx={ctx} ouvrir={ouvrirSiClic} />
                    ))}
                  </KanbanColumnContent>
                </CardContent>
              </Card>
            </KanbanColumn>
          );
        })}
      </KanbanBoard>
      <KanbanOverlay>
        {({ value, variant }) => {
          if (variant === "column") return null;
          const p = Object.values(colonnes)
            .flat()
            .find((x) => x.id === value);
          return p ? <CarteProspect p={p} proprietes={affichees} ctx={ctx} surcouche /> : null;
        }}
      </KanbanOverlay>
    </Kanban>
  );
}
