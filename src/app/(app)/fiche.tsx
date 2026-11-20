"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modale, useModale, type Apercu } from "@/components/interface/modale";
import { SectionsGlissantes } from "@/components/interface/sections-glissantes";
import { IconeFermer, IconeLienExterne } from "@/components/icones";
import { BadgeStatut } from "@/components/badges";
import { ChoixEtape } from "@/components/vues/proprietes";
import { TexteAnime } from "@/components/interface/texte-anime";
import type { FicheProspect, MessageFil } from "@/server/donnees";
import { FilMessages } from "@/components/fil-messages";
import { RedactionMessage } from "@/components/redaction-message";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/interface/elements";
import { LogoLinkedIn } from "@/components/logos";
import { lienProfilLinkedIn } from "@/lib/linkedin-url";
import { NotesProspect } from "./notes-prospect";
import { OngletProfil } from "./onglet-profil";
import { InvitationProspect } from "./invitation-prospect";
import { useOrdreFiches } from "@/components/ordre-fiches";
import { IconeCorbeille, IconeFlecheDroite } from "@/components/icones-pages";
import { actionLireFiche, actionSupprimerProspect, type DonneesFiche } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { useDansEcran } from "@/components/interface/dans-ecran";

const EVENEMENTS: Record<string, string> = {
  invitation: "Invitation",
  message: "Message",
  lecture_profil: "Lecture du profil",
  lecture_liste: "Synchronisation",
  retrait_invitation: "Invitation retirée",
  acceptation: "Invitation acceptée",
  reponse: "Réponse reçue",
  changement_etape: "Changement d'étape",
};
const RESULTATS: Record<string, string> = {
  succes: "",
  echec: " · échec",
  incertain: " · à vérifier",
  en_cours: " · en cours",
};
const fmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

const fmtJour = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

function jourRelance(date: string | null) {
  if (!date) return "Non planifiée";
  const j = fmtJour.format(new Date(`${date}T12:00:00Z`));
  return j.charAt(0).toUpperCase() + j.slice(1);
}

/** Fiche prospect en modale centrée, ouverte par ?prospect=<id> (lien direct possible). */
export function ModaleFiche({
  fiche: ficheServeur,
  libelleEtape: libelleServeur,
  conversation: conversationServeur,
  restants,
  modeSimule,
}: {
  fiche: FicheProspect;
  libelleEtape: string;
  /** Fil du prospect : conversation existante (id), ou premiers messages encore en file (id null). */
  conversation: { id: string | null; messages: MessageFil[] } | null;
  /** Messages encore possibles aujourd'hui (quota du jour). */
  restants: number;
  modeSimule: boolean;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();

  // Fiches voisines préchargées : un glisser (ou une flèche) affiche aussitôt la fiche suivante,
  // pendant que l'URL et les données du serveur suivent. Les données du serveur l'emportent dès
  // qu'elles portent sur la fiche affichée (plus récentes).
  const [cache, setCache] = useState<Record<string, DonneesFiche>>({});
  const demandees = useRef(new Set<string>()); // fiches déjà demandées au serveur (une lecture chacune)
  const [locale, setLocale] = useState<DonneesFiche | null>(null);
  // Fiche demandée pas encore chargée (glisser très rapide) : squelette jusqu'aux données serveur.
  const [attente, setAttente] = useState<string | null>(null);
  const affichee: DonneesFiche =
    locale && locale.fiche.id !== ficheServeur.id
      ? locale
      : { fiche: ficheServeur, libelleEtape: libelleServeur, conversation: conversationServeur };
  const { fiche, libelleEtape, conversation } = affichee;
  const serveur: DonneesFiche = { fiche: ficheServeur, libelleEtape: libelleServeur, conversation: conversationServeur };
  const lire = (id: string): DonneesFiche | undefined => (id === ficheServeur.id ? serveur : (cache[id] ?? (locale?.fiche.id === id ? locale : undefined)));
  const enAttente = !!attente && attente !== ficheServeur.id && attente !== locale?.fiche.id;
  // Même onglet pour la fiche et ses voisines : le glisser arrive sur l'onglet déjà ouvert.
  const [onglet, setOnglet] = useState(params.get("onglet") === "conversation" ? "conversation" : "informations");
  const telephone = useEstTelephone();

  const fermer = () => {
    const q = new URLSearchParams(params);
    q.delete("prospect");
    q.delete("onglet");
    router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
  };
  const nom = [fiche.prenom, fiche.nom].filter(Boolean).join(" ") || "Prospect";

  // Flèches précédente / suivante : ordre de la liste affichée derrière la fiche.
  const ordre = useOrdreFiches();
  const [enCours, demarrer] = useTransition();
  const rang = ordre.indexOf(fiche.id);
  const aller = (id: string | undefined) => {
    if (!id) return;
    const deja = lire(id);
    if (deja) setLocale(deja);
    setAttente(deja ? null : id);
    const q = new URLSearchParams(params);
    q.set("prospect", id);
    demarrer(() => router.replace(`${chemin}?${q}`, { scroll: false }));
  };
  const nav: Navigation = {
    precedent: rang > 0 ? () => aller(ordre[rang - 1]) : undefined,
    suivant: rang >= 0 && rang < ordre.length - 1 ? () => aller(ordre[rang + 1]) : undefined,
    position: rang >= 0 ? `${rang + 1} sur ${ordre.length}` : null,
    enCours,
  };
  // Préchargement des deux voisines de la fiche affichée (lecture seule, côté serveur vérifié).
  const voisines = [ordre[rang - 1], ordre[rang + 1]].filter((x): x is string => !!x && rang >= 0).join(",");
  useEffect(() => {
    // Une lecture arrivée après un nouveau glisser reste utile : le cache est indexé par fiche.
    for (const id of voisines ? voisines.split(",") : []) {
      if (demandees.current.has(id)) continue;
      demandees.current.add(id);
      actionLireFiche(id)
        .then((d) => {
          // L'aperçu de la voisine s'affiche dès son arrivée.
          if (d) setCache((c) => ({ ...c, [id]: d }));
        })
        .catch(() => {});
    }
  }, [voisines]);
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  });
  // Clavier : ← → hors des champs de saisie.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible?.closest("input, textarea, select, [contenteditable='true'], [role='tab']")) return;
      if (e.key === "ArrowLeft") navRef.current.precedent?.();
      if (e.key === "ArrowRight") navRef.current.suivant?.();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, []);

  // Aperçus des voisines (téléphone seulement : carrousel du glisser), depuis le cache.
  const apercu = (id: string | undefined): Apercu | undefined => {
    if (!telephone || !id) return undefined;
    const d = lire(id);
    if (!d) return { enTete: <EnTeteSquelette />, contenu: <CorpsSquelette /> };
    const n = [d.fiche.prenom, d.fiche.nom].filter(Boolean).join(" ") || "Prospect";
    return {
      enTete: <EnTeteFiche fiche={d.fiche} nom={n} nav={{ ...nav, precedent: undefined, suivant: undefined }} modeSimule={modeSimule} apercu />,
      contenu: <CorpsFiche {...d} nom={n} restants={restants} modeSimule={modeSimule} onglet={onglet} changerOnglet={setOnglet} />,
    };
  };

  return (
    // Taille fixe : une longue conversation défile dans son encadré, la modale ne bouge pas.
    <Modale
      fermer={fermer}
      hauteurFixe
      glisserHorizontal={{ precedent: nav.precedent, suivant: nav.suivant }}
      voisins={nav.position ? { precedent: nav.precedent && apercu(ordre[rang - 1]), suivant: nav.suivant && apercu(ordre[rang + 1]) } : undefined}
      enTete={enAttente ? <EnTeteSquelette /> : <EnTeteFiche fiche={fiche} nom={nom} nav={nav} modeSimule={modeSimule} anime={!telephone} />}
    >
      {enAttente ? (
        <CorpsSquelette />
      ) : (
        <CorpsFiche
          fiche={fiche}
          libelleEtape={libelleEtape}
          conversation={conversation}
          nom={nom}
          restants={restants}
          modeSimule={modeSimule}
          onglet={onglet}
          changerOnglet={setOnglet}
          anime={!telephone}
        />
      )}
    </Modale>
  );
}

/** Téléphone (< 640 px) : seul cas où les voisines sont rendues (carrousel du glisser). */
function useEstTelephone() {
  return useSyncExternalStore(
    (rappel) => {
      const m = window.matchMedia("(max-width: 639px)");
      m.addEventListener("change", rappel);
      return () => m.removeEventListener("change", rappel);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

function EnTeteSquelette() {
  return (
    <header className="flex shrink-0 flex-col gap-4 px-6 pb-5 pt-5 sm:px-8 sm:pt-7" aria-busy="true">
      <span className="squelette size-14 rounded-full" />
      <span className="squelette h-8 w-56 rounded-xl" />
      <span className="squelette h-4 w-40" />
    </header>
  );
}

function CorpsSquelette() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6 pt-1 sm:px-8" aria-busy="true">
      <span className="squelette h-9 w-full rounded-full" />
      <span className="squelette h-40 w-full rounded-2xl" />
      <span className="squelette h-24 w-full rounded-2xl" />
    </div>
  );
}

/** Corps de la fiche (onglets) : fiche affichée et aperçus des voisines. */
function CorpsFiche({
  fiche,
  conversation,
  nom,
  restants,
  modeSimule,
  onglet,
  changerOnglet,
  anime = false,
}: DonneesFiche & { nom: string; restants: number; modeSimule: boolean; onglet: string; changerOnglet: (id: string) => void; anime?: boolean }) {
  return (
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-1 sm:px-8 sm:pb-8">
        <SectionsGlissantes
          remplir
          actifId={onglet}
          surChangement={changerOnglet}
          libelle="Fiche du prospect"
          sections={[
            {
              id: "informations",
              libelle: "Informations",
              libelleCourt: "Infos",
              contenu: (
                <div className="flex flex-col gap-6">
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-trait bg-trait sm:grid-cols-3">
                    {[
                      {
                        t: "Relation",
                        d: <BadgeStatut statut={fiche.statutRelation} />,
                      },
                      {
                        t: "Étape",
                        d: <ChoixEtape key={`${fiche.id}:${fiche.etape}`} prospectId={fiche.id} nom={nom} etape={fiche.etape} etapes={fiche.etapes} />,
                      },
                      {
                        t: "Prochaine relance",
                        d: jourRelance(fiche.prochaineRelance),
                      },
                      {
                        t: "Liste d'origine",
                        d: fiche.listeOrigine ?? "Aucune",
                      },
                      { t: "Entreprise", d: fiche.entreprise ?? "Inconnue" },
                      {
                        t: "Identifiant LinkedIn",
                        d: fiche.identifie ? "Lu" : "Lecture en file",
                      },
                    ].map((x, i) => (
                      <div
                        key={x.t}
                        className={`flex min-w-0 flex-col gap-1.5 bg-carte px-4 py-3 ${i === 0 || i === 5 ? "col-span-2 sm:col-span-1" : ""}`}
                      >
                        <dt className="caption-4 text-encre-3">{x.t}</dt>
                        <dd className="flex min-h-6 items-center body-6 text-encre">
                          {typeof x.d === "string" ? <TexteAnime texte={x.d} actif={anime} /> : x.d}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {fiche.informationsListe.length > 0 && (
                    <section className="flex flex-col gap-2" aria-label={`Informations de la liste ${fiche.listeOrigine ?? ""}`}>
                      <h3 className="caption-4 text-encre-3">{fiche.listeOrigine}</h3>
                      <dl className="flex flex-col divide-y divide-trait overflow-hidden rounded-2xl border border-trait">
                        {fiche.informationsListe.map((info) => (
                          <div key={info.cle} className="flex flex-col gap-1 bg-carte px-4 py-3 sm:flex-row sm:gap-4">
                            <dt className="caption-4 text-encre-3 sm:w-36 sm:shrink-0 sm:pt-0.5">{info.libelle}</dt>
                            <dd className="selectionnable min-w-0 whitespace-pre-wrap break-words body-6 text-encre">
                              {info.type === "lien" ? (
                                <a
                                  href={info.valeur}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-rouge underline-offset-2 outline-none hover:underline focus-visible:underline"
                                >
                                  <span className="break-all">{new URL(info.valeur).hostname}</span>
                                  <IconeLienExterne taille={11} />
                                  <span className="sr-only"> (nouvel onglet)</span>
                                </a>
                              ) : (
                                info.valeur
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

                  {/* Clé : un autre prospect (navigation ← →) repart de ses propres notes. */}
                  <NotesProspect key={fiche.id} prospectId={fiche.id} initiales={fiche.notes} />
                </div>
              ),
            },
            ...(fiche.profil
              ? [{ id: "profil", libelle: "Profil", contenu: <OngletProfil profil={fiche.profil} /> }]
              : []),
            {
              id: "conversation",
              libelle: "Conversation",
              compte: conversation?.messages.length ?? 0,
              contenu: (
                <OngletConversation
                  fiche={fiche}
                  nom={nom}
                  conversation={conversation}
                  restants={restants}
                  modeSimule={modeSimule}
                />
              ),
            },
            {
              id: "historique",
              libelle: "Historique",
              compte: fiche.historique.length,
              contenu: (
                <div className="flex flex-col gap-4">
                {fiche.relance && <EtatRelance relance={fiche.relance} />}
                {fiche.historique.length === 0 ? (
                  <p className="rounded-2xl bg-creux px-4 py-6 text-center caption-5 text-encre-3">
                    Aucun événement
                  </p>
                ) : (
                  <ol className="relative ml-1 flex flex-col gap-4 border-l border-trait py-1 pl-5">
                    {fiche.historique.map((e, i) => (
                      <li key={i} className="relative">
                        <span
                          aria-hidden
                          className={`absolute -left-[25.5px] top-1 size-2.5 rounded-full ring-4 ring-carte ${e.enFile ? "bg-trait-fort" : e.resultat === "succes" ? "bg-accent" : "bg-amber-400"}`}
                        />
                        <p className="title-4 text-encre">
                          {EVENEMENTS[e.type] ?? e.type}
                          <span className="font-normal text-encre-3">
                            {e.auto ? " · automatique" : ""}
                            {e.enFile
                              ? " · en file"
                              : (RESULTATS[e.resultat ?? ""] ?? "")}
                          </span>
                        </p>
                        <time
                          dateTime={new Date(e.date).toISOString()}
                          className="caption-5 text-encre-3"
                        >
                          {e.enFile ? "Départ estimé " : ""}
                          {fmt.format(new Date(e.date))}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
                </div>
              ),
            },
          ]}
        />
      </div>
  );
}

type Navigation = { precedent?: () => void; suivant?: () => void; position: string | null; enCours: boolean };

function BoutonFleche({ sens, action, desactive }: { sens: "precedent" | "suivant"; action?: () => void; desactive: boolean }) {
  return (
    <button
      type="button"
      onClick={action}
      disabled={!action || desactive}
      aria-label={sens === "precedent" ? "Prospect précédent" : "Prospect suivant"}
      title={sens === "precedent" ? "Prospect précédent (←)" : "Prospect suivant (→)"}
      className="grid size-9 place-items-center rounded-full text-encre-2 outline-none transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-creux hover:text-encre active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35"
    >
      <IconeFlecheDroite taille={15} className={sens === "precedent" ? "-scale-x-100" : undefined} />
    </button>
  );
}

/** Corbeille : suppression définitive après confirmation (fiche et toutes ses données). */
function SupprimerProspect({ prospectId, prenom }: { prospectId: string; prenom: string }) {
  const { fermer } = useModale();
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const annuler = useRef<HTMLButtonElement>(null);
  const panneau = useDansEcran<HTMLDivElement>(confirmer);
  useEffect(() => {
    if (confirmer) annuler.current?.focus();
  }, [confirmer]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConfirmer((v) => !v)}
        aria-expanded={confirmer}
        aria-label="Supprimer ce prospect"
        title="Supprimer ce prospect"
        className="grid size-9 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-accent-doux hover:text-rouge focus-visible:ring-2 focus-visible:ring-accent aria-expanded:bg-accent-doux aria-expanded:text-rouge"
      >
        <IconeCorbeille taille={16} />
      </button>
      {confirmer && (
        <div
          ref={panneau}
          role="alertdialog"
          aria-label="Confirmer la suppression"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setConfirmer(false);
            }
          }}
          className="flottant dans-ecran absolute right-0 top-11 z-10 flex w-[min(280px,calc(100vw-32px))] animate-apparition flex-col gap-3 overflow-y-auto rounded-[18px] p-4"
        >
          <p className="body-6 text-encre">Supprimer {prenom} définitivement ?</p>
          <p className="caption-5 text-encre-3">
            Fiche, notes, photo, conversations et messages, historique et file d&apos;attente : tout est effacé. Irréversible
          </p>
          <div className="flex justify-end gap-2">
            <button ref={annuler} type="button" onClick={() => setConfirmer(false)} className="bouton bouton-discret px-3 py-1.5 caption-3">
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                demarrer(async () => {
                  const r = await actionSupprimerProspect(prospectId);
                  retourner(r);
                  if (r.ok) fermer();
                  else setConfirmer(false);
                })
              }
              className="bouton bouton-plein px-3 py-1.5 caption-3"
            >
              {enCours ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnTeteFiche({
  fiche,
  nom,
  nav,
  modeSimule,
  apercu = false,
  anime = false,
}: {
  fiche: FicheProspect;
  nom: string;
  nav: Navigation;
  modeSimule: boolean;
  /** Aperçu d'une voisine (carrousel) : pas d'identifiant de titre, rien de focalisable. */
  apercu?: boolean;
  /**
   * Passage à la fiche voisine par les flèches ou le clavier : nom et informations changent en
   * « Blur Out Up » (animate-text). Pas sur téléphone, où le glisser fait déjà entrer la voisine.
   */
  anime?: boolean;
}) {
  const { fermer, titreId } = useModale();
  const lienProfil = lienProfilLinkedIn(fiche.linkedinUrl);
  const sousTitre = [fiche.poste, fiche.entreprise, fiche.profil?.localisation].filter(Boolean).join(" · ");
  return (
    <header className="flex shrink-0 flex-col gap-4 px-6 pb-5 pt-5 sm:px-8 sm:pt-7">
      <div className="flex items-start justify-between gap-4">
        <Avatar nom={nom} taille={56} photo={fiche.photo} />
        <div className="flex items-center gap-1">
          <SupprimerProspect key={fiche.id} prospectId={fiche.id} prenom={fiche.prenom ?? nom} />
          <span aria-hidden className="mx-1 h-5 w-px bg-trait" />
          {nav.position && (
            <span className="mr-1 caption-5 tabular-nums text-encre-3" aria-live="polite">
              {nav.position}
            </span>
          )}
          {nav.position && (
            <>
              <BoutonFleche sens="precedent" action={nav.precedent} desactive={nav.enCours} />
              <BoutonFleche sens="suivant" action={nav.suivant} desactive={nav.enCours} />
              <span aria-hidden className="mx-1 h-5 w-px bg-trait" />
            </>
          )}
        <button
          type="button"
          onClick={fermer}
          aria-label="Fermer la fiche"
          className="grid size-9 shrink-0 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
        >
          <IconeFermer taille={16} />
        </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2
          id={apercu ? undefined : titreId}
          className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-encre sm:text-[32px]"
        >
          <TexteAnime texte={nom} actif={anime} />
        </h2>
        {(sousTitre || lienProfil) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {sousTitre && (
              <p className="body-6 text-encre-2">
                <TexteAnime texte={sousTitre} actif={anime} />
              </p>
            )}
            {sousTitre && lienProfil && <span aria-hidden className="h-3.5 w-px bg-trait-fort" />}
            {lienProfil && (
              <a
                href={lienProfil}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 rounded-md caption-3 text-encre-3 outline-none transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-encre focus-visible:text-encre focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LogoLinkedIn taille={14} className="opacity-70 grayscale transition-[filter,opacity] duration-150 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0" />
                <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-px transition-[background-size] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[length:100%_1px]">
                  Ouvrir son LinkedIn
                </span>
                <IconeLienExterne
                  taille={11}
                  className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </div>
        )}
        <div className="mt-2 empty:hidden">
          <InvitationProspect key={fiche.id} fiche={fiche} prenom={fiche.prenom ?? nom} modeSimule={modeSimule} />
        </div>
      </div>
    </header>
  );
}

/** Encadré du fil : défile seul (la modale garde sa taille) et s'ouvre sur le dernier message. */
function FilDefilant({ nombre, children }: { nombre: number; children: ReactNode }) {
  const zone = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const z = zone.current;
    if (z) z.scrollTop = z.scrollHeight;
  }, [nombre]);
  return (
    <div
      ref={zone}
      tabIndex={0}
      aria-label="Messages"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain fond-conversation rounded-2xl p-4 ring-1 ring-inset ring-trait outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </div>
  );
}

/** Précision selon l'état de l'invitation (LinkedIn n'accepte un message normal qu'entre relations de 1er degré). */
function precisionPasEnRelation(statut: string, prenom: string): string | null {
  if (statut === "a_inviter") return `Envoie-lui une invitation depuis le haut de la fiche : l'écriture s'ouvrira dès que ${prenom} l'aura acceptée`;
  if (statut === "en_attente") return `Invitation envoyée, pas encore acceptée : l'écriture s'ouvrira dès que ${prenom} l'aura acceptée`;
  if (statut === "invitation_recue") return `${prenom} t'a envoyé une invitation : accepte-la sur LinkedIn, l'écriture s'ouvrira ensuite`;
  return null;
}

function PasEnRelation({ statut, prenom }: { statut: string; prenom: string }) {
  const precision = precisionPasEnRelation(statut, prenom);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-creux px-6 py-10 text-center">
      {/* Emoji animé « Cross Mark » (Telegram-Animated-Emojis), décoratif. */}
      <Image src="/emojis/croix.webp" alt="" width={64} height={64} unoptimized priority />
      <h3 className="title-3 text-encre">{prenom} n&apos;est pas encore en Relation</h3>
      {precision && <p className="max-w-[420px] caption-5 text-encre-3">{precision}</p>}
    </div>
  );
}

function OngletConversation({
  fiche,
  nom,
  conversation,
  restants,
  modeSimule,
}: {
  fiche: FicheProspect;
  nom: string;
  conversation: { id: string | null; messages: MessageFil[] } | null;
  restants: number;
  modeSimule: boolean;
}) {
  const prenom = fiche.prenom ?? nom;
  const existante = conversation?.id ?? null;
  const messages = conversation?.messages ?? [];
  // Écrire est possible dans une conversation existante, ou pour démarrer avec une relation de 1er degré.
  const peutEcrire = !!existante || fiche.statutRelation === "en_relation";
  const bloque = modeSimule ? "Unipile n'est pas branché : aucune action LinkedIn ne peut partir" : undefined;

  if (!peutEcrire) {
    return <PasEnRelation statut={fiche.statutRelation} prenom={prenom} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <FilDefilant nombre={messages.length}>
        {messages.length > 0 ? (
          <FilMessages messages={messages} nom={nom} photo={fiche.photo} surMotif />
        ) : (
          <p className="grid h-full place-items-center text-center body-6 text-encre-2">
            Aucun message avec {prenom} pour l&apos;instant : écris le premier
          </p>
        )}
      </FilDefilant>
      <RedactionMessage
        cible={existante ? { conversationId: existante } : { prospectId: fiche.id }}
        destinataire={prenom}
        restants={restants}
        bloque={bloque}
      />
      {existante && (
        <Link
          href={`/inbox?conversation=${existante}`}
          className="bouton bouton-discret shrink-0 self-start px-3 py-1.5 caption-3 text-rouge"
        >
          Ouvrir dans l&apos;Inbox
        </Link>
      )}
    </div>
  );
}

const ETATS_RELANCE: Record<string, string> = {
  attente_retrait: "retrait prévu",
  retrait_en_file: "retrait en file",
  attente_reinvitation: "réinvitation prévue",
  reinvitation_en_file: "réinvitation en file",
  mis_de_cote: "relances épuisées",
  termine: "terminée",
};
const fmtRelance = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

/** Relance automatique des invitations (page Workflow) : étape du prospect et prochaine date. */
function EtatRelance({ relance }: { relance: NonNullable<FicheProspect["relance"]> }) {
  return (
    <p className="rounded-2xl bg-creux px-4 py-3 caption-4 text-encre-2 ring-1 ring-trait">
      Relance automatique : {ETATS_RELANCE[relance.etat] ?? relance.etat}
      {relance.prochaineLe && ["attente_retrait", "attente_reinvitation"].includes(relance.etat) ? ` le ${fmtRelance.format(new Date(relance.prochaineLe))}` : ""}
      {relance.cycle > 0 ? ` · ${relance.cycle} relance${relance.cycle > 1 ? "s" : ""} faite${relance.cycle > 1 ? "s" : ""}` : ""}
    </p>
  );
}
