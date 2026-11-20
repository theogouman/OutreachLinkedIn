"use client";

/*
 * Éditeur de période du panneau « Filtres » : calendrier par plage avec raccourcis, d'après le
 * motif ReUI c-calendar-16 (« Range calendar with presets »), en français. Raccourcis tournés vers
 * l'avenir pour une relance (à venir, en retard), vers le passé pour une entrée en relation ou un
 * dernier message. Un seul jour choisi = « à partir du » ; « En retard ou aujourd'hui » = « jusqu'au ».
 */

import { useState } from "react";
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { fr } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { FilterEditorProps } from "@/components/reui/filters/filters-types";
import type { Periode } from "@/lib/filtres/requete-prospects";

const JOUR = "yyyy-MM-dd";
const enJour = (d: Date | undefined) => (d ? format(d, JOUR) : undefined);
const versPlage = (p: Periode | undefined): DateRange | undefined =>
  p?.du || p?.au ? { from: p.du ? parseISO(p.du) : undefined, to: p.au ? parseISO(p.au) : undefined } : undefined;

const fmtCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fmtLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Texte d'une période (« 12 nov. au 20 nov. 2026 », « jusqu'au 20 nov. 2026 »…). */
export function textePeriode(p: Periode | undefined): string {
  const du = p?.du ? parseISO(p.du) : null;
  const au = p?.au ? parseISO(p.au) : null;
  if (du && au) {
    if (p!.du === p!.au) return `le ${fmtLong.format(du)}`;
    return `${(du.getFullYear() === au.getFullYear() ? fmtCourt : fmtLong).format(du)} au ${fmtLong.format(au)}`;
  }
  if (du) return `à partir du ${fmtLong.format(du)}`;
  if (au) return `jusqu'au ${fmtLong.format(au)}`;
  return "";
}

type Raccourci = { libelle: string; periode: (aujourdhui: Date) => Periode };

const A_VENIR: Raccourci[] = [
  { libelle: "En retard ou aujourd'hui", periode: (t) => ({ au: enJour(t) }) },
  { libelle: "Aujourd'hui", periode: (t) => ({ du: enJour(t), au: enJour(t) }) },
  { libelle: "Demain", periode: (t) => ({ du: enJour(addDays(t, 1)), au: enJour(addDays(t, 1)) }) },
  { libelle: "7 prochains jours", periode: (t) => ({ du: enJour(t), au: enJour(addDays(t, 6)) }) },
  { libelle: "30 prochains jours", periode: (t) => ({ du: enJour(t), au: enJour(addDays(t, 29)) }) },
  { libelle: "Ce mois-ci", periode: (t) => ({ du: enJour(startOfMonth(t)), au: enJour(endOfMonth(t)) }) },
];
const PASSE: Raccourci[] = [
  { libelle: "Aujourd'hui", periode: (t) => ({ du: enJour(t), au: enJour(t) }) },
  { libelle: "Hier", periode: (t) => ({ du: enJour(subDays(t, 1)), au: enJour(subDays(t, 1)) }) },
  { libelle: "7 derniers jours", periode: (t) => ({ du: enJour(subDays(t, 6)), au: enJour(t) }) },
  { libelle: "30 derniers jours", periode: (t) => ({ du: enJour(subDays(t, 29)), au: enJour(t) }) },
  { libelle: "Ce mois-ci", periode: (t) => ({ du: enJour(startOfMonth(t)), au: enJour(t) }) },
  { libelle: "Mois dernier", periode: (t) => ({ du: enJour(startOfMonth(subMonths(t, 1))), au: enJour(endOfMonth(subMonths(t, 1))) }) },
  { libelle: "Cette année", periode: (t) => ({ du: enJour(startOfYear(t)), au: enJour(t) }) },
];

export function EditeurPeriode({ field, value, onValueChange, commit }: FilterEditorProps<Periode>) {
  const aujourdhui = new Date();
  const futur = field.id === "relance";
  const raccourcis = futur ? A_VENIR : PASSE;
  const [mois, setMois] = useState<Date>(() => versPlage(value)?.to ?? versPlage(value)?.from ?? aujourdhui);
  const plage = versPlage(value);
  const complet = !!(value?.du || value?.au);

  const choisir = (p: Periode) => {
    onValueChange(p);
    const cible = p.au ?? p.du;
    if (cible) setMois(parseISO(cible));
  };

  return (
    <div className="flex flex-col">
      <div className="flex max-sm:flex-col">
        <div className="relative py-3 max-sm:order-1 max-sm:border-t sm:w-44">
          <div className="h-full sm:border-e">
            <div className="flex flex-col px-2">
              {raccourcis.map((r) => (
                <Button key={r.libelle} className="w-full justify-start font-normal" size="sm" variant="ghost" onClick={() => choisir(r.periode(aujourdhui))}>
                  {r.libelle}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Calendar
          locale={fr}
          mode="range"
          disabled={futur ? undefined : [{ after: aujourdhui }]}
          month={mois}
          onMonthChange={setMois}
          selected={plage}
          onSelect={(p) => onValueChange(p ? { du: enJour(p.from), au: enJour(p.to) } : undefined)}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
        <span className="truncate text-xs text-muted-foreground">{complet ? textePeriode(value) : "Choisis une période"}</span>
        <Button size="sm" disabled={!complet} onClick={() => commit(value)}>
          Appliquer
        </Button>
      </div>
    </div>
  );
}
