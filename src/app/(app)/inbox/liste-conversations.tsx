"use client";

/*
 * Liste des conversations de l'Inbox, sur le standard des listes filtrées (useListeFiltree) :
 * menu de filtres combinables (Dropdown menu morph) et recherche, résultats instantanés,
 * sans changement d'URL. Seule la conversation ouverte est dans l'URL (?conversation=id).
 */

import Link from "next/link";
import { useListeFiltree } from "@/components/filtres/use-liste-filtree";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";
import { MenuFiltres } from "@/components/filtres/menu-filtres";
import { Avatar } from "@/components/interface/elements";
import { IconeFermer, IconeInbox } from "@/components/icones";
import { IconeFiltresListe, IconeRechercheTexte } from "@/components/icones-pages";
import { CASES_INBOX, FILTRES_INBOX, type FiltresInbox } from "@/lib/filtres/inbox";
import { actionListerConversations } from "@/app/actions";
import type { LigneConversation } from "@/server/donnees";

const fmtJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const fmtCle = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

function quand(iso: Date | string) {
  const d = new Date(iso);
  return fmtCle.format(d) === fmtCle.format(new Date()) ? fmtHeure.format(d) : fmtJour.format(d);
}

export function ListeConversations({
  initial,
  filtresInitiaux,
  ouverte,
  charger = actionListerConversations,
}: {
  initial: { lignes: LigneConversation[]; total: number };
  filtresInitiaux: FiltresInbox;
  ouverte: string | null;
  /** Source des résultats filtrés (l'action serveur ; remplaçable dans les tests). */
  charger?: typeof actionListerConversations;
}) {
  const l = useListeFiltree({ initial, filtresInitiaux, definitions: FILTRES_INBOX, charger });
  const f = l.filtres;

  return (
    <aside className="carte flex min-h-0 flex-col overflow-hidden">
      {/* Encoche : filtres et recherche */}
      <div className="border-b border-trait p-2">
        <div className="flex items-center gap-1.5 rounded-[18px] bg-creux p-1" role="search" aria-label="Filtrer les conversations">
          <MenuFiltres
            cases={CASES_INBOX as { cle: "nonLus" | "aTraiter" | "horsCrm"; libelle: string }[]}
            valeurs={f}
            changer={(cle, v) => l.changer(cle, v)}
            reinitialiser={() => {
              for (const c of CASES_INBOX) if (f[c.cle as keyof FiltresInbox]) l.changer(c.cle, "");
            }}
            Icone={IconeFiltresListe}
            libelle="Filtrer les conversations"
          />
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher une conversation</span>
            <IconeRechercheTexte taille={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-3" />
            <input
              type="search"
              value={f.recherche ?? ""}
              onChange={(e) => l.changer("recherche", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && f.recherche) {
                  e.preventDefault();
                  l.changer("recherche", "");
                }
              }}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full rounded-full bg-carte pl-9 pr-9 body-6 text-encre shadow-[0_0_0_1px_var(--color-trait)] outline-none transition-shadow duration-150 placeholder:text-encre-3 focus-visible:shadow-[0_0_0_1px_var(--color-accent),0_0_0_3px_rgba(224,98,90,0.12)] [&::-webkit-search-cancel-button]:appearance-none"
            />
            <TexteSaisieAnime valeur={f.recherche ?? ""} placeholder="Rechercher" />
            <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
              {l.enCours ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-trait border-t-accent" role="status" aria-label="Chargement des conversations" />
              ) : (
                f.recherche && (
                  <button
                    type="button"
                    onClick={() => l.changer("recherche", "")}
                    aria-label="Effacer la recherche"
                    className="grid size-6 place-items-center rounded-full text-encre-3 outline-none hover:bg-black/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <IconeFermer taille={12} />
                  </button>
                )
              )}
            </span>
          </label>
        </div>
      </div>

      {l.erreur && (
        <p role="alert" className="mx-3 mt-3 rounded-xl bg-accent-doux px-3 py-2 caption-5 text-action">
          {l.erreur}
        </p>
      )}

      {l.lignes.length === 0 ? (
        <div className="m-auto flex flex-col items-center gap-2 p-8 text-center">
          <IconeInbox taille={20} className="text-encre-3" />
          <p className="title-4 text-encre">Rien ici</p>
          <p className="caption-5 text-encre-3">{l.actifs > 0 ? "Aucune conversation ne correspond" : "Aucune conversation pour l'instant"}</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {l.lignes.map((c) => {
            const actif = c.id === ouverte;
            return (
              <li key={c.id} className="animate-apparition border-b border-trait last:border-0">
                <Link
                  href={`/inbox?conversation=${c.id}`}
                  scroll={false}
                  aria-current={actif ? "true" : undefined}
                  className={`relative flex gap-3 px-4 py-3 outline-none transition-colors duration-150 focus-visible:bg-accent-doux ${actif ? "bg-accent-doux" : "hover:bg-creux"}`}
                >
                  <Avatar nom={c.nom} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate ${c.nonLu ? "title-4 text-encre" : "body-6 text-encre"}`}>{c.nom}</span>
                      {c.dernierMessageAt && (
                        <time className={`shrink-0 caption-5 tabular-nums ${c.nonLu ? "text-action" : "text-encre-3"}`}>{quand(c.dernierMessageAt)}</time>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`truncate caption-5 ${c.nonLu ? "text-encre-2" : "text-encre-3"}`}>
                        {c.dernierSens === "sortant" ? "Vous : " : ""}
                        {c.apercu}
                      </span>
                      {c.nonLu && <span className="ml-auto size-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                    </span>
                    {!c.prospectId && <span className="mt-0.5 self-start rounded-full bg-amber-50 px-1.5 caption-4 text-amber-800">Hors CRM</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
