"use client";
/*
 * Adapté de ui-components (components/motion/file-upload.tsx, zone de dépôt)
 * MIT License — Copyright (c) 2026 Saurabh Chauhan — https://github.com/starc007/ui-components
 * Modifications : un seul fichier CSV, le fichier déposé alimente le vrai <input name>
 * du formulaire (envoi et validation côté serveur inchangés), icône SVG en ligne,
 * libellés français, charte de l'outil. File d'envoi et progression retirées.
 */

import { useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const RAPIDE = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

export function ZoneFichier({
  name,
  titre,
  onFichier,
}: {
  name: string;
  titre: string;
  onFichier?: (f: File | undefined) => void;
}) {
  const reduit = useReducedMotion();
  const entreeRef = useRef<HTMLInputElement>(null);
  const profondeur = useRef(0);
  const [survol, setSurvol] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const aideId = useId();

  const choisir = (f: File | undefined) => {
    setFichier(f ?? null);
    onFichier?.(f);
  };

  return (
    <div>
      <input
        ref={entreeRef}
        type="file"
        name={name}
        accept=".csv,text/csv"
        required
        tabIndex={-1}
        className="sr-only"
        aria-describedby={aideId}
        onChange={(e) => choisir(e.currentTarget.files?.[0])}
      />
      <button
        type="button"
        data-survol={survol}
        onClick={() => entreeRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          profondeur.current += 1;
          setSurvol(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          profondeur.current = Math.max(0, profondeur.current - 1);
          if (profondeur.current === 0) setSurvol(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          profondeur.current = 0;
          setSurvol(false);
          const f = e.dataTransfer.files[0];
          if (!f || !entreeRef.current) return;
          const dt = new DataTransfer();
          dt.items.add(f);
          entreeRef.current.files = dt.files;
          choisir(f);
        }}
        className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-trait-fort bg-creux p-5 text-left outline-none transition-[border-color,transform] duration-200 hover:border-encre-3 focus-visible:ring-2 focus-visible:ring-action active:scale-[0.99] data-[survol=true]:border-accent data-[survol=true]:bg-accent-doux"
      >
        <motion.span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-carte text-action ring-1 ring-trait"
          animate={reduit ? undefined : { y: survol ? -2 : 0 }}
          transition={RAPIDE}
        >
          <svg viewBox="0 0 256 256" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round">
            <path d="M128 152V40M88 80l40-40 40 40M216 152v56a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8v-56" />
          </svg>
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className="block title-4 text-encre">{fichier ? fichier.name : titre}</span>
          <span id={aideId} className="mt-0.5 block caption-5 text-encre-3">
            {fichier ? `${Math.max(1, Math.round(fichier.size / 1024))} Ko · cliquer pour changer` : "Glisser-déposer ou cliquer · .csv, 5 Mo maximum"}
          </span>
        </span>
      </button>
    </div>
  );
}
