"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { actionBasculerAutomatisation, actionReglerAutomatisation } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { SaisieValeurs } from "@/components/interface/saisie-valeurs";
import { ReglageExtensible } from "@/components/interface/reglage-extensible";
import { SectionsGlissantes } from "@/components/interface/sections-glissantes";
import { usePublierOrdreFiches } from "@/components/ordre-fiches";
import { IconeHorloge, IconeInviter, IconePause, IconePlay, IconeRetirer, IconeSynchro } from "@/components/icones";
import { IconePageWorkflow } from "@/components/icones-pages";
import type { ReglagesRelance } from "@/lib/automatisations/catalogue";
import type { AutomatisationAffichee } from "@/server/automatisations/lecture";
import type { EtatSuivi } from "@/server/automatisations/relance-invitations";

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const fmtLancement = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const ETAPES: { etat: EtatSuivi; libelle: string }[] = [
  { etat: "attente_retrait", libelle: "Invitation en attente" },
  { etat: "retrait_en_file", libelle: "Retrait en file" },
  { etat: "attente_reinvitation", libelle: "Délai de 3 semaines" },
  { etat: "reinvitation_en_file", libelle: "Réinvitation en file" },
  { etat: "mis_de_cote", libelle: "Relances épuisées" },
  { etat: "termine", libelle: "Terminées" },
];
const ACTIONS = { retrait: "Retirer l'invitation", invitation: "Réinviter" } as const;

/** Automatisations de la page Workflow : un encadré extensible chacune, un seul ouvert à la fois. */
export function ListeAutomatisations({ automatisations }: { automatisations: AutomatisationAffichee[] }) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {automatisations.map((a) => (
        <ReglageExtensible
          key={a.id}
          id={a.code}
          icone={<IconeRetirer taille={18} />}
          titre={a.nom}
          description="Retire une invitation restée sans réponse, puis la renvoie trois semaines plus tard, en boucle"
          resume={resume(a)}
          ouvert={ouverte === a.id}
          onOuvrir={() => setOuverte(a.id)}
          onFermer={() => setOuverte(null)}
        >
          <ContenuAutomatisation a={a} />
        </ReglageExtensible>
      ))}
    </div>
  );
}

function resume(a: AutomatisationAffichee) {
  const suivies = ETAPES.filter((e) => e.etat !== "termine").reduce((n, e) => n + a.compteurs[e.etat], 0);
  const prochaine = a.prochaines[0];
  return [
    a.active ? "Active" : "En pause",
    `${suivies} invitation${suivies > 1 ? "s" : ""} suivie${suivies > 1 ? "s" : ""}`,
    a.active && prochaine ? `prochaine action ${fmtJour.format(new Date(prochaine.date))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Détail d'une automatisation : prospects à chaque étape (toujours visibles), puis trois onglets
 * glissants — Déroulé (tableau blanc), Logs, Réglages — avec, à droite des onglets, l'interrupteur
 * en icône et son info-bulle (transition Transitions.dev « Tooltip »).
 */
function ContenuAutomatisation({ a }: { a: AutomatisationAffichee }) {
  return (
    <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-trait ring-1 ring-trait sm:grid-cols-3 lg:grid-cols-6">
        {ETAPES.map((e) => (
          <div key={e.etat} className="flex flex-col gap-0.5 bg-carte px-4 py-3">
            <dt className="caption-5 text-encre-3">{e.libelle}</dt>
            <dd className="title-3 tabular-nums text-encre">{a.compteurs[e.etat]}</dd>
          </div>
        ))}
      </dl>
      <SectionsGlissantes
        libelle={`Détail : ${a.nom}`}
        aCote={<Interrupteur a={a} />}
        sections={[
          { id: "deroule", libelle: "Déroulé", contenu: <TableauDeroule a={a} /> },
          { id: "logs", libelle: "Logs", compte: a.dernieres.length, contenu: <Logs a={a} /> },
          { id: "reglages", libelle: "Réglages", contenu: <FormReglagesAutomatisation id={a.id} initial={a.reglages} /> },
        ]}
      />
    </div>
  );
}

/** Interrupteur en icône (pause / lecture) ; l'info-bulle dit quand l'automatisation a été lancée. */
function Interrupteur({ a }: { a: AutomatisationAffichee }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const bulleId = useId();
  const lancement = a.activeLe ? fmtLancement.format(new Date(a.activeLe)) : null;
  const bulle = a.active
    ? `Active, lancée le ${lancement ?? "—"} · ${a.aujourdhui.misEnFile} sur ${a.aujourdhui.plafond} actions aujourd'hui`
    : lancement
      ? `En pause, dernier lancement le ${lancement}`
      : "En pause, jamais lancée";
  const basculer = () => {
    if (
      !a.active &&
      !window.confirm(
        `Activer la relance ? Jusqu'à ${a.reglages.plafond_jour} actions LinkedIn par jour (retraits puis réinvitations) partiront de ton compte, toujours après tes propres actions et sous les quotas.`,
      )
    ) {
      return;
    }
    demarrer(async () => retourner(await actionBasculerAutomatisation({ id: a.id, active: !a.active })));
  };

  return (
    <span className="t-tt-wrap shrink-0">
      <button
        type="button"
        onClick={basculer}
        disabled={enCours}
        aria-label={a.active ? "Mettre en pause" : "Activer"}
        aria-describedby={bulleId}
        className={`t-tt-trigger relative grid size-10 place-items-center rounded-full outline-none ring-1 ring-inset transition-[background-color,transform] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
          a.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/30" : "bg-creux text-encre-2 ring-trait hover:bg-encre/[0.06] hover:text-encre"
        }`}
      >
        {a.active ? <IconePause taille={18} /> : <IconePlay taille={18} />}
        {a.active && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-carte" aria-hidden />}
      </button>
      <span id={bulleId} role="tooltip" className="t-tt t-tt-droite caption-4">
        {bulle}
      </span>
    </span>
  );
}

// ─── Déroulé : tableau blanc ────────────────────────────────────────────────────

type Ton = "declencheur" | "attente" | "condition" | "action" | "boucle" | "sortie";
const TONS: Record<Ton, string> = {
  declencheur: "bg-carte text-encre ring-1 ring-trait-fort",
  attente: "bg-carte text-encre-2 ring-1 ring-trait",
  condition: "bg-carte text-encre border border-dashed border-trait-fort",
  action: "bg-accent-doux text-encre ring-1 ring-trait",
  boucle: "bg-carte text-encre-2 ring-1 ring-trait",
  sortie: "bg-creux text-encre-2 ring-1 ring-trait",
};
const ICONES: Record<Ton, ReactNode> = {
  declencheur: <IconePageWorkflow taille={12} />,
  attente: <IconeHorloge taille={14} />,
  condition: null,
  action: null,
  boucle: <IconeSynchro taille={14} />,
  sortie: null,
};

function Etiquette({ ton, compte, icone, children }: { ton: Ton; compte?: number; icone?: ReactNode; children: ReactNode }) {
  return (
    <span className={`relative inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 caption-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${TONS[ton]}`}>
      {icone ?? ICONES[ton]}
      {children}
      {compte !== undefined && (
        <span className="rounded-full bg-encre/[0.06] px-1.5 caption-4 tabular-nums text-encre-2" title="Prospects à cette étape">
          {compte}
        </span>
      )}
    </span>
  );
}

function Branche({ children }: { children: ReactNode }) {
  return <span className="inline-flex w-fit rounded-full bg-encre px-2 py-0.5 caption-4 text-carte">{children}</span>;
}

/** Déroulé en tableau blanc : étapes en étiquettes reliées, la condition se divise en deux branches. */
function TableauDeroule({ a }: { a: AutomatisationAffichee }) {
  const r = a.reglages;
  const plage = (p: { min: number; max: number }) => (p.min === p.max ? `${p.min} j` : `${p.min} à ${p.max} j`);
  const c = a.compteurs;
  return (
    <div className="tableau-blanc overflow-x-auto rounded-2xl p-5 ring-1 ring-inset ring-trait sm:p-6">
      <div className="arbre-chaine flex min-w-max flex-col items-start">
        <Etiquette ton="declencheur">Invitation en attente</Etiquette>
        <Etiquette ton="attente" compte={c.attente_retrait}>
          Attendre {plage(r.attente_jours)}
        </Etiquette>
        <Etiquette ton="condition">Toujours en attente ?</Etiquette>
      </div>
      <ul className="arbre-branches min-w-max">
        <li>
          <div className="arbre-chaine flex flex-col items-start">
            <Branche>Oui</Branche>
            <Etiquette ton="action" icone={<IconeRetirer taille={14} />} compte={c.retrait_en_file}>
              Retirer l&apos;invitation
            </Etiquette>
            <Etiquette ton="attente" compte={c.attente_reinvitation}>
              Attendre {plage(r.reinvitation_jours)}
            </Etiquette>
            <Etiquette ton="action" icone={<IconeInviter taille={14} />} compte={c.reinvitation_en_file}>
              Réinviter
            </Etiquette>
            <Etiquette ton="boucle">
              {r.cycles === null ? "Recommencer · sans limite" : `Recommencer · ${r.cycles} fois au plus`}
            </Etiquette>
            {r.cycles !== null && (
              <Etiquette ton="sortie" compte={c.mis_de_cote}>
                Relances épuisées
              </Etiquette>
            )}
          </div>
        </li>
        <li>
          <div className="arbre-chaine flex flex-col items-start">
            <Branche>Non : acceptée ou refusée</Branche>
            <Etiquette ton="sortie" compte={c.termine}>
              Terminée
            </Etiquette>
          </div>
        </li>
      </ul>
    </div>
  );
}

// ─── Logs ────────────────────────────────────────────────────────────────────────

function Logs({ a }: { a: AutomatisationAffichee }) {
  // Fiches ouvertes depuis les logs : flèches et gestes précédent / suivant dans l'ordre des logs.
  usePublierOrdreFiches([...new Set([...a.prochaines, ...a.dernieres].flatMap((x) => (x.prospectId ? [x.prospectId] : [])))]);
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <h3 className="title-4 text-encre">À venir</h3>
        {a.prochaines.length ? (
          <ul className="divide-y divide-trait rounded-2xl ring-1 ring-inset ring-trait">
            {a.prochaines.map((x, i) => (
              <LigneAction key={`${x.prospectId}-${i}`} prospectId={x.prospectId} nom={x.nom} action={ACTIONS[x.action]} date={x.date}>
                {x.enFile ? <span className="rounded-full bg-creux px-2 py-0.5 caption-4 text-encre-2">en file</span> : null}
              </LigneAction>
            ))}
          </ul>
        ) : (
          <p className="body-6 text-encre-3">Aucune action prévue pour l&apos;instant.</p>
        )}
      </section>
      <section className="flex flex-col gap-2.5">
        <h3 className="title-4 text-encre">Faites</h3>
        {a.dernieres.length ? (
          <ul className="divide-y divide-trait rounded-2xl ring-1 ring-inset ring-trait">
            {a.dernieres.map((x, i) => (
              <LigneAction key={`${x.prospectId}-${i}`} prospectId={x.prospectId} nom={x.nom} action={ACTIONS[x.action]} date={x.date}>
                {x.resultat !== "succes" ? (
                  <span className="caption-4 text-amber-800 dark:text-amber-300">{x.resultat === "echec" ? "échec" : "à vérifier"}</span>
                ) : null}
              </LigneAction>
            ))}
          </ul>
        ) : (
          <p className="body-6 text-encre-3">Rien encore.</p>
        )}
      </section>
    </div>
  );
}

/**
 * Une action : le nom ouvre la fiche du prospect par-dessus la page Workflow (?prospect=…) —
 * modale centrée sur ordinateur, panneau du bas sur téléphone, avec ses gestes — sans quitter la page.
 */
function LigneAction({ prospectId, nom, action, date, children }: { prospectId: string | null; nom: string; action: string; date: Date; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-20 shrink-0 caption-4 tabular-nums text-encre-3">{fmtJour.format(new Date(date))}</span>
      <span className="min-w-0 flex-1 truncate body-6 text-encre">
        {prospectId ? (
          <Link
            href={`?prospect=${prospectId}`}
            scroll={false}
            className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
          >
            {nom}
          </Link>
        ) : (
          nom
        )}
        <span className="text-encre-3"> · {action}</span>
      </span>
      {children}
    </li>
  );
}

// ─── Réglages ──────────────────────────────────────────────────────────────────

function FormReglagesAutomatisation({ id, initial }: { id: string; initial: ReglagesRelance }) {
  const [r, setR] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  // Plage toujours cohérente : bornes remises dans l'ordre si besoin.
  const plage = (cle: "attente_jours" | "reinvitation_jours", [a, b]: number[]) =>
    setR((s) => ({ ...s, [cle]: { min: Math.min(a!, b!), max: Math.max(a!, b!) } }));

  return (
    <form action={() => demarrer(async () => retourner(await actionReglerAutomatisation({ id, reglages: r })))} className="flex flex-col gap-5">
      <Ligne libelle="Attente avant le retrait" aide="Depuis l'envoi de l'invitation, tirée au hasard entre ces deux durées">
        <SaisieValeurs
          libelle="Attente avant le retrait"
          segments={[
            { valeur: r.attente_jours.min, min: 7, max: 120, suffixe: "j", libelle: "Attente minimum, en jours" },
            { valeur: r.attente_jours.max, min: 7, max: 120, suffixe: "j", libelle: "Attente maximum, en jours" },
          ]}
          onChange={(v) => plage("attente_jours", v)}
        />
      </Ligne>
      <Ligne libelle="Délai avant de réinviter" aide="Depuis le retrait, entre ces deux durées ; LinkedIn impose 21 jours au moins">
        <SaisieValeurs
          libelle="Délai avant de réinviter"
          segments={[
            { valeur: r.reinvitation_jours.min, min: 21, max: 90, suffixe: "j", libelle: "Délai minimum, en jours" },
            { valeur: r.reinvitation_jours.max, min: 21, max: 90, suffixe: "j", libelle: "Délai maximum, en jours" },
          ]}
          onChange={(v) => plage("reinvitation_jours", v)}
        />
      </Ligne>
      <Ligne libelle="Nombre de relances" aide="Par prospect, avant de le mettre de côté">
        <select
          aria-label="Nombre de relances"
          value={r.cycles === null ? "sans" : String(r.cycles)}
          onChange={(e) => setR((s) => ({ ...s, cycles: e.target.value === "sans" ? null : Number(e.target.value) }))}
          className="champ w-auto"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="sans">Sans limite</option>
        </select>
      </Ligne>
      <Ligne libelle="Actions par jour" aide="Retraits et réinvitations mis en file, au plus">
        <SaisieValeurs
          libelle="Actions par jour"
          segments={[{ valeur: r.plafond_jour, min: 1, max: 20, suffixe: "/ jour", libelle: "Actions par jour, 20 au plus" }]}
          onChange={([v]) => setR((s) => ({ ...s, plafond_jour: v! }))}
        />
      </Ligne>
      <div className="flex justify-end border-t border-trait pt-4">
        <button type="submit" disabled={enCours} className="bouton bouton-plein">
          {enCours ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
      </div>
    </form>
  );
}

/** Un réglage : libellé et aide au-dessus sur téléphone, à gauche sur grand écran ; valeurs sur une ligne. */
function Ligne({ libelle, aide, children }: { libelle: string; aide: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center sm:gap-6">
      <span className="flex flex-col">
        <span className="caption-3 text-encre">{libelle}</span>
        <span className="caption-5 text-encre-3">{aide}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
