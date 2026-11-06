"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { actionImporterProspects, actionImporterRelations } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { ZoneFichier } from "@/components/interface/zone-fichier";

const carte = "flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm";
const champ = "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm";
const bouton = "self-start rounded-lg bg-[#b5443d] px-4 py-2 text-sm font-medium text-white hover:bg-[#9c3a34] disabled:opacity-60";

export function ImportRelations() {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  return (
    <form
      className={carte}
      action={(fd) => demarrer(async () => retourner(await actionImporterRelations(fd)))}
    >
      <div>
        <h2 className="font-semibold">1. Relations LinkedIn (archive)</h2>
        <p className="text-sm text-neutral-600">
          Fichier <code>Connections.csv</code> de l&apos;archive LinkedIn (Préférences → Confidentialité des données →
          Obtenir une copie de vos données). Met à jour les statuts sans aucun appel LinkedIn. Seules l&apos;URL et la
          date de connexion sont conservées.
        </p>
      </div>
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
      <div>
        <h2 className="font-semibold">2. Prospects (export CSV d&apos;une base Notion)</h2>
        <p className="text-sm text-neutral-600">
          Dans Notion : ⋯ → Exporter → Markdown &amp; CSV. Chaque nouveau prospect reçoit une lecture de profil mise en
          file, sous le quota de lecture (un gros import s&apos;étale sur plusieurs jours).
        </p>
      </div>
      <ZoneFichier name="fichier" titre="Choisir l'export CSV Notion" onFichier={(f) => void lireEnTetes(f)} />
      {colonnes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {CHAMPS.map((c) => (
            <label key={c.cle} className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-600">
                {c.libelle}
                {c.requis && " *"}
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
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600">Liste d&apos;origine (pour filtrer et mesurer)</span>
            <input name="liste" maxLength={100} placeholder="ex. Salon Novembre 2026" className={champ} />
          </label>
        </div>
      )}
      <button type="submit" disabled={enCours || !choix.url} className={bouton}>
        {enCours ? "Import en cours…" : "Importer les prospects"}
      </button>
    </form>
  );
}
