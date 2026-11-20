"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { actionBasculerAutomatisation, actionReglerAutomatisation } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { Compteur } from "@/components/interface/compteur";
import { CorpsReglage, PiedReglage, ReglageExtensible } from "@/components/interface/reglage-extensible";
import { IconeRetirer } from "@/components/icones";
import { MODULES_RELANCE, type ReglagesRelance } from "@/lib/automatisations/catalogue";
import type { AutomatisationAffichee } from "@/server/automatisations/lecture";
import type { EtatSuivi } from "@/server/automatisations/relance-invitations";

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const fmtLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

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

function ContenuAutomatisation({ a }: { a: AutomatisationAffichee }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
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
    <>
      <CorpsReglage>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-creux px-4 py-3 ring-1 ring-trait">
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 title-4 text-encre">
              <span className={`size-2 shrink-0 rounded-full ${a.active ? "bg-emerald-500" : "bg-trait-fort"}`} aria-hidden />
              {a.active ? `Active${a.activeLe ? ` depuis le ${fmtLong.format(new Date(a.activeLe))}` : ""}` : "En pause"}
            </p>
            <p className="pl-4 caption-5 text-encre-3">
              {a.aujourdhui.misEnFile} sur {a.aujourdhui.plafond} actions mises en file aujourd&apos;hui
            </p>
          </div>
          <button type="button" disabled={enCours} onClick={basculer} className={`bouton ${a.active ? "bouton-contour" : "bouton-plein"}`}>
            {enCours ? "Patiente…" : a.active ? "Mettre en pause" : "Activer"}
          </button>
        </div>

        <Bloc titre="Déroulé">
          <Deroule reglages={a.reglages} />
        </Bloc>

        <Bloc titre="Prospects à chaque étape">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-trait ring-1 ring-trait sm:grid-cols-3">
            {ETAPES.map((e) => (
              <div key={e.etat} className="flex flex-col gap-0.5 bg-carte px-4 py-3">
                <dt className="caption-5 text-encre-3">{e.libelle}</dt>
                <dd className="title-3 tabular-nums text-encre">{a.compteurs[e.etat]}</dd>
              </div>
            ))}
          </dl>
        </Bloc>

        <Bloc titre="Prochaines actions">
          {a.prochaines.length ? (
            <ul className="divide-y divide-trait rounded-2xl ring-1 ring-trait">
              {a.prochaines.map((x, i) => (
                <LigneAction key={`${x.prospectId}-${i}`} prospectId={x.prospectId} nom={x.nom} action={ACTIONS[x.action]} date={x.date}>
                  {x.enFile ? <span className="rounded-full bg-creux px-2 py-0.5 caption-4 text-encre-2">en file</span> : null}
                </LigneAction>
              ))}
            </ul>
          ) : (
            <p className="body-6 text-encre-3">Aucune action prévue pour l&apos;instant.</p>
          )}
        </Bloc>

        <Bloc titre="Dernières actions faites">
          {a.dernieres.length ? (
            <ul className="divide-y divide-trait rounded-2xl ring-1 ring-trait">
              {a.dernieres.map((x, i) => (
                <LigneAction key={`${x.prospectId}-${i}`} prospectId={x.prospectId} nom={x.nom} action={ACTIONS[x.action]} date={x.date}>
                  {x.resultat !== "succes" ? <span className="caption-4 text-amber-800 dark:text-amber-300">{x.resultat === "echec" ? "échec" : "à vérifier"}</span> : null}
                </LigneAction>
              ))}
            </ul>
          ) : (
            <p className="body-6 text-encre-3">Rien encore.</p>
          )}
        </Bloc>
      </CorpsReglage>
      <FormReglagesAutomatisation id={a.id} initial={a.reglages} />
    </>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="title-4 text-encre">{titre}</h3>
      {children}
    </section>
  );
}

function LigneAction({ prospectId, nom, action, date, children }: { prospectId: string | null; nom: string; action: string; date: Date; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-20 shrink-0 caption-4 tabular-nums text-encre-3">{fmtJour.format(new Date(date))}</span>
      <span className="min-w-0 flex-1 truncate body-6 text-encre">
        {prospectId ? (
          <Link href={`/?prospect=${prospectId}`} className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
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

/** Déroulé en modules (repris par l'éditeur d'une itération suivante), avec les réglages en cours. */
function Deroule({ reglages }: { reglages: ReglagesRelance }) {
  const plage = (p: { min: number; max: number }) => (p.min === p.max ? `${p.min} j` : `${p.min} à ${p.max} j`);
  const libelle = (m: (typeof MODULES_RELANCE)[number]) => {
    switch (m.type) {
      case "declencheur":
        return "Invitation en attente";
      case "attente":
        return `Attendre ${plage(m.reglage === "attente_jours" ? reglages.attente_jours : reglages.reinvitation_jours)}`;
      case "condition":
        return "Toujours en attente ?";
      case "action":
        return m.code === "retirer_invitation" ? "Retirer l'invitation" : "Réinviter";
      case "boucle":
        return reglages.cycles === null ? "Recommencer, sans limite" : `Recommencer, ${reglages.cycles} fois au plus`;
    }
  };
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {MODULES_RELANCE.map((m, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 caption-4 ring-1 ring-inset ${m.type === "action" ? "bg-accent-doux text-encre ring-trait" : "bg-carte text-encre-2 ring-trait"}`}
          >
            {libelle(m)}
          </span>
          {i < MODULES_RELANCE.length - 1 && (
            <span className="caption-5 text-encre-3" aria-hidden>
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function FormReglagesAutomatisation({ id, initial }: { id: string; initial: ReglagesRelance }) {
  const [r, setR] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const plage = (cle: "attente_jours" | "reinvitation_jours", bout: "min" | "max", v: number) =>
    setR((s) => {
      const p = { ...s[cle], [bout]: v };
      // Plage toujours cohérente : le minimum ne dépasse jamais le maximum.
      if (bout === "min" && p.max < v) p.max = v;
      if (bout === "max" && p.min > v) p.min = v;
      return { ...s, [cle]: p };
    });

  return (
    <form action={() => demarrer(async () => retourner(await actionReglerAutomatisation({ id, reglages: r })))}>
      <div className="flex flex-col gap-5 border-t border-trait px-5 py-5 sm:px-6 sm:py-6">
        <h3 className="title-4 text-encre">Réglages</h3>
        <Ligne libelle="Attente avant le retrait" aide="Depuis l'envoi de l'invitation, tirée au hasard">
          <Compteur valeur={r.attente_jours.min} min={7} max={120} libelle="Attente minimum, en jours" onChange={(v) => plage("attente_jours", "min", v)} />
          <span className="caption-5 text-encre-3">à</span>
          <Compteur valeur={r.attente_jours.max} min={7} max={120} libelle="Attente maximum, en jours" onChange={(v) => plage("attente_jours", "max", v)} />
          <span className="caption-5 text-encre-3">j</span>
        </Ligne>
        <Ligne libelle="Délai avant de réinviter" aide="Depuis le retrait ; LinkedIn impose 21 jours au moins">
          <Compteur valeur={r.reinvitation_jours.min} min={21} max={90} libelle="Délai minimum, en jours" onChange={(v) => plage("reinvitation_jours", "min", v)} />
          <span className="caption-5 text-encre-3">à</span>
          <Compteur valeur={r.reinvitation_jours.max} min={21} max={90} libelle="Délai maximum, en jours" onChange={(v) => plage("reinvitation_jours", "max", v)} />
          <span className="caption-5 text-encre-3">j</span>
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
          <Compteur valeur={r.plafond_jour} min={1} max={20} libelle="Actions par jour" onChange={(v) => setR((s) => ({ ...s, plafond_jour: v }))} />
        </Ligne>
      </div>
      <PiedReglage>
        <button type="submit" disabled={enCours} className="bouton bouton-plein">
          {enCours ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
      </PiedReglage>
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
