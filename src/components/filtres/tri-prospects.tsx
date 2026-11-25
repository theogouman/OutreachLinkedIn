"use client";

/*
 * Bouton « Trier » de la liste Prospects, à côté de « Filtres » : menu déroulant (primitives shadcn
 * sur Base UI, même style que le panneau de filtres ReUI) avec le champ, puis le sens, formulé
 * selon le champ (A → Z, début du pipeline d'abord, plus récentes d'abord…). Tri appliqué par le
 * serveur sur toute la liste filtrée (pagination comprise), et aussitôt en local en attendant.
 * Bouton en rouge pastel quand le tri n'est pas celui par défaut (nom, A → Z).
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconeTrier } from "@/components/icones";
import { CHAMPS_TRI, TRI_DEFAUT, type ChampTri, type Tri } from "@/lib/filtres/prospects";

const CHAMPS: Record<ChampTri, { libelle: string; sens: { asc: string; desc: string }; defaut: Tri["sens"] }> = {
  nom: { libelle: "Nom", sens: { asc: "A → Z", desc: "Z → A" }, defaut: "asc" },
  entreprise: { libelle: "Entreprise", sens: { asc: "A → Z", desc: "Z → A" }, defaut: "asc" },
  etape: { libelle: "Étape", sens: { asc: "Début du pipeline d'abord", desc: "Fin du pipeline d'abord" }, defaut: "asc" },
  relance: { libelle: "Prochaine relance", sens: { asc: "Plus proches d'abord", desc: "Plus lointaines d'abord" }, defaut: "asc" },
  message: { libelle: "Dernier message", sens: { asc: "Plus anciens d'abord", desc: "Plus récents d'abord" }, defaut: "desc" },
  relation: { libelle: "Entrée en relation", sens: { asc: "Plus anciennes d'abord", desc: "Plus récentes d'abord" }, defaut: "desc" },
  ajout: { libelle: "Ajout dans l'outil", sens: { asc: "Plus anciens d'abord", desc: "Plus récents d'abord" }, defaut: "desc" },
};

export function TriProspects({ tri, changer }: { tri: Tri | undefined; changer: (tri: Tri | undefined) => void }) {
  const t = tri ?? TRI_DEFAUT;
  const actif = t.champ !== TRI_DEFAUT.champ || t.sens !== TRI_DEFAUT.sens;
  const choisir = (suivant: Tri) => changer(suivant.champ === TRI_DEFAUT.champ && suivant.sens === TRI_DEFAUT.sens ? undefined : suivant);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            // Téléphone : icône seule (le libellé reste pour les lecteurs d'écran).
            className={`h-10 gap-2 rounded-full px-4 font-normal max-sm:w-10 max-sm:px-0 ${actif ? "border-accent/30 bg-accent-doux text-rouge hover:bg-accent-doux hover:text-rouge" : ""}`}
            aria-label={`Trier : ${CHAMPS[t.champ].libelle}, ${CHAMPS[t.champ].sens[t.sens]}`}
          >
            <IconeTrier taille={17} />
            <span className="max-sm:hidden">{actif ? CHAMPS[t.champ].libelle : "Trier"}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Trier par</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={t.champ} onValueChange={(v) => choisir({ champ: v as ChampTri, sens: CHAMPS[v as ChampTri].defaut })}>
            {CHAMPS_TRI.map((c) => (
              <DropdownMenuRadioItem key={c} value={c} closeOnClick={false}>
                {CHAMPS[c].libelle}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ordre</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={t.sens} onValueChange={(v) => choisir({ champ: t.champ, sens: v as Tri["sens"] })}>
            {(["asc", "desc"] as const).map((s) => (
              <DropdownMenuRadioItem key={s} value={s} closeOnClick>
                {CHAMPS[t.champ].sens[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
