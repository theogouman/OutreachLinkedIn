"use client";

/*
 * Invitation LinkedIn depuis la fiche : bouton principal (sans note) et menu déroulant pour
 * joindre une note personnalisée, grisé quand le quota mensuel de notes est atteint. Un seul
 * chemin d'envoi : l'action serveur met l'invitation en file (quotas, plages horaires, délai
 * entre actions) ; le statut est revérifié côté serveur, à la mise en file puis à l'envoi.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { actionInviterProspect } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { IconeAttente, IconeChevronBas, IconeInviter } from "@/components/icones";
import { NOTE_INVITATION_MAX } from "@/lib/invitation";
import type { FicheProspect } from "@/server/donnees";

export function InvitationProspect({ fiche, prenom, modeSimule }: { fiche: FicheProspect; prenom: string; modeSimule: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState("");
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const racine = useRef<HTMLDivElement>(null);
  const chevron = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const panneauId = useId();
  const aideId = useId();
  // Identifiant de demande : un double clic n'invite qu'une fois (nouvelle demande si la note change).
  const cle = useRef<string | null>(null);

  const { enFile, notesRestantes, plafondNotes } = fiche.invitation;
  const bloque = modeSimule && !fiche.demo ? "Unipile n'est pas encore branché : seules les données de démonstration peuvent être invitées" : null;
  const notesEpuisees = notesRestantes !== null && notesRestantes <= 0;

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOuvert(false);
        chevron.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap, true);
    champ.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap, true);
    };
  }, [ouvert]);

  if (fiche.statutRelation !== "a_inviter" && !enFile) return null;

  if (enFile) {
    return (
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-creux px-3 py-1.5 caption-3 text-encre-2">
        <IconeAttente taille={14} />
        Invitation en file d&apos;attente
      </span>
    );
  }

  const inviter = (avecNote: boolean) => {
    if (enCours || bloque) return;
    cle.current ??= crypto.randomUUID();
    const texte = avecNote ? note.trim() : "";
    demarrer(async () => {
      const r = await actionInviterProspect({ prospectId: fiche.id, note: texte || undefined, cle: cle.current });
      retourner(r);
      if (r.ok) {
        setOuvert(false);
        setNote("");
        cle.current = null;
      }
    });
  };

  const titreChevron = notesEpuisees
    ? `Quota de notes atteint ce mois-ci (${plafondNotes} sur ${plafondNotes})`
    : "Ajouter une note personnalisée";

  return (
    <div ref={racine} className="relative flex flex-col items-start gap-1.5">
      <div className="inline-flex">
        <button
          type="button"
          onClick={() => inviter(false)}
          disabled={enCours || !!bloque}
          className="bouton bouton-plein rounded-r-none py-2 pl-3.5 pr-3 caption-3"
        >
          <IconeInviter taille={16} />
          {enCours && !ouvert ? "Mise en file…" : "Envoyer l'invitation"}
        </button>
        <button
          ref={chevron}
          type="button"
          onClick={() => {
            setOuvert((v) => !v);
            cle.current = null;
          }}
          disabled={enCours || !!bloque || notesEpuisees}
          aria-expanded={ouvert}
          aria-controls={panneauId}
          aria-label={titreChevron}
          title={titreChevron}
          className="bouton bouton-plein rounded-l-none border-l border-white/25 px-2.5 py-2 disabled:grayscale"
        >
          <IconeChevronBas taille={14} className={`transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />
        </button>
      </div>
      {bloque && <p className="caption-5 text-encre-3">{bloque}</p>}
      {!bloque && notesEpuisees && <p className="caption-5 text-encre-3">Quota de notes du mois atteint : invitation sans note</p>}

      {ouvert && (
        <form
          id={panneauId}
          aria-label="Invitation avec une note"
          onSubmit={(e) => {
            e.preventDefault();
            inviter(true);
          }}
          className="flottant absolute left-0 top-11 z-20 flex w-[min(340px,calc(100vw-48px))] animate-apparition flex-col gap-3 rounded-[18px] p-4"
        >
          <label htmlFor={`${panneauId}-note`} className="body-6 text-encre">
            Note pour {prenom}
          </label>
          <textarea
            ref={champ}
            id={`${panneauId}-note`}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              cle.current = null; // note modifiée : nouvelle demande
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                inviter(true);
              }
            }}
            rows={4}
            maxLength={NOTE_INVITATION_MAX}
            aria-describedby={aideId}
            className="champ selectionnable resize-none"
          />
          <p id={aideId} className="flex justify-between gap-3 caption-5 text-encre-3">
            <span>
              {notesRestantes === null
                ? "Sans plafond mensuel"
                : `${notesRestantes} note${notesRestantes > 1 ? "s" : ""} restante${notesRestantes > 1 ? "s" : ""} ce mois-ci`}
            </span>
            <span className="tabular-nums">
              {note.length} / {NOTE_INVITATION_MAX}
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOuvert(false)} className="bouton bouton-discret px-3 py-1.5 caption-3">
              Annuler
            </button>
            <button type="submit" disabled={enCours || note.trim().length === 0} className="bouton bouton-plein px-3 py-1.5 caption-3">
              {enCours ? "Mise en file…" : "Inviter avec la note"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
