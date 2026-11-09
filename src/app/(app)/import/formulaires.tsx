"use client";

import { useState, useTransition, type ReactNode } from "react";
import Papa from "papaparse";
import { actionImporterProspects, actionImporterRelations } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { ZoneFichier } from "@/components/interface/zone-fichier";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";

const carte = "carte flex flex-col gap-5 p-6";
const champ = "champ";
const bouton = "bouton bouton-plein self-start";

function Etape({ numero, titre, children }: { numero: number; titre: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-creux caption-3 text-encre-2 ring-1 ring-trait" aria-hidden>
        {numero}
      </span>
      <div className="min-w-0">
        <h2 className="title-2 text-encre">{titre}</h2>
        <div className="mt-1 body-6 text-encre-3">{children}</div>
      </div>
    </div>
  );
}

export function ImportRelations() {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  return (
    <form
      className={carte}
      action={(fd) => demarrer(async () => retourner(await actionImporterRelations(fd)))}
    >
      <Etape numero={1} titre="Relations LinkedIn (archive)">
        <p>
          Fichier <code className="rounded bg-creux px-1 py-0.5 caption-4 text-encre-2">Connections.csv</code> de l&apos;archive LinkedIn (Préférences → Confidentialité des données →
          Obtenir une copie de vos données). Met à jour les statuts sans aucun appel LinkedIn. Seules l&apos;URL et la
          date de connexion sont conservées.
        </p>
      </Etape>
      <ZoneFichier name="fichier" titre="Choisir Connections.csv" />
      <button type="submit" disabled={enCours} className={bouton}>
        {enCours ? "Import en cours…" : "Importer les relations"}
      </button>
    </form>
  );
}

type Champ = "url" | "nomComplet" | "prenom" | "nom" | "poste" | "entreprise";
const CHAMPS: { cle: Champ; libelle: string; indices: RegExp; requis?: boolean }[] = [
  { cle: "url", libelle: "URL LinkedIn", indices: /linkedin|url|profil/i, requis: true },
  { cle: "nomComplet", libelle: "Nom complet", indices: /^(name|nom complet|nom|contact)$/i },
  { cle: "prenom", libelle: "Prénom", indices: /pr[ée]nom|first/i },
  { cle: "nom", libelle: "Nom de famille", indices: /^(nom de famille|last name|surname)$/i },
  { cle: "poste", libelle: "Poste", indices: /poste|title|fonction|job|role/i },
  { cle: "entreprise", libelle: "Entreprise", indices: /entreprise|company|soci[ée]t[ée]|organisation/i },
];

export function ImportProspects() {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const [colonnes, setColonnes] = useState<string[]>([]);
  const [choix, setChoix] = useState<Partial<Record<Champ, string>>>({});
  const [liste, setListe] = useState("");

  async function lireEnTetes(fichier: File | undefined) {
    setColonnes([]);
    setChoix({});
    if (!fichier) return;
    // Lecture locale de la seule ligne d'en-tête ; l'analyse complète est faite côté serveur.
    const texte = await fichier.slice(0, 64 * 1024).text();
    const r = Papa.parse<string[]>(texte.replace(/^﻿/, ""), { preview: 1 });
    const cols = (r.data[0] ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 200);
    setColonnes(cols);
    const devine: Partial<Record<Champ, string>> = {};
    for (const c of CHAMPS) {
      const trouve = cols.find((col) => c.indices.test(col));
      if (trouve) devine[c.cle] = trouve;
    }
    setChoix(devine);
  }

  return (
    <form
      className={carte}
      action={(fd) => {
        fd.set("correspondance", JSON.stringify(Object.fromEntries(Object.entries(choix).filter(([, v]) => v))));
        demarrer(async () => retourner(await actionImporterProspects(fd)));
      }}
    >
      <Etape numero={2} titre="Prospects (export CSV d'une base Notion)">
        <p>
          Dans Notion : ⋯ → Exporter → Markdown &amp; CSV. Chaque nouveau prospect reçoit une lecture de profil mise en
          file, sous le quota de lecture (un gros import s&apos;étale sur plusieurs jours).
        </p>
      </Etape>
      <ZoneFichier name="fichier" titre="Choisir l'export CSV Notion" onFichier={(f) => void lireEnTetes(f)} />
      {colonnes.length > 0 && (
        <fieldset className="grid animate-apparition gap-3 rounded-xl bg-creux p-4 ring-1 ring-trait sm:grid-cols-2">
          <legend className="sr-only">Correspondance des colonnes</legend>
          {CHAMPS.map((c) => (
            <label key={c.cle} className="flex flex-col gap-1.5">
              <span className="caption-4 text-encre-2">
                {c.libelle}
                {c.requis && <span className="text-action"> *</span>}
              </span>
              <select
                className={champ}
                required={c.requis}
                value={choix[c.cle] ?? ""}
                onChange={(e) => setChoix((s) => ({ ...s, [c.cle]: e.target.value || undefined }))}
              >
                <option value="">—</option>
                {colonnes.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="relative flex flex-col gap-1.5 sm:col-span-2">
            <span className="caption-4 text-encre-2">Liste d&apos;origine (pour filtrer et mesurer)</span>
            <input name="liste" maxLength={100} value={liste} onChange={(e) => setListe(e.target.value)} className={champ} />
            <TexteSaisieAnime valeur={liste} placeholder="Salon novembre 2026" />
          </label>
        </fieldset>
      )}
      <button type="submit" disabled={enCours || !choix.url} className={bouton}>
        {enCours ? "Import en cours…" : "Importer les prospects"}
      </button>
    </form>
  );
}

