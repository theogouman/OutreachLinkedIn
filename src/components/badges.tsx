import { LIBELLES_STATUT, type StatutRelation } from "@/lib/statut-relation";

/* Toujours un libellé en plus de la couleur (ai-design-skills, inventaire besoin 5). */
const STATUT: Record<StatutRelation, { fond: string; point: string }> = {
  en_relation: { fond: "bg-emerald-50 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-300 ring-emerald-200/80 dark:ring-emerald-400/30", point: "bg-emerald-500" },
  en_attente: { fond: "bg-amber-50 dark:bg-amber-400/15 text-amber-800 dark:text-amber-300 ring-amber-200/80 dark:ring-amber-400/30", point: "bg-amber-500" },
  invitation_recue: { fond: "bg-sky-50 dark:bg-sky-400/15 text-sky-800 dark:text-sky-300 ring-sky-200/80 dark:ring-sky-400/30", point: "bg-sky-500" },
  a_inviter: { fond: "bg-stone-100 dark:bg-stone-800 text-encre-2 ring-stone-200 dark:ring-stone-700", point: "bg-stone-400" },
};

export function BadgeStatut({ statut }: { statut: string }) {
  const s = (statut in LIBELLES_STATUT ? statut : "a_inviter") as StatutRelation;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 caption-4 whitespace-nowrap ring-1 ring-inset ${STATUT[s].fond}`}>
      <span className={`size-1.5 rounded-full ${STATUT[s].point}`} aria-hidden />
      {LIBELLES_STATUT[s]}
    </span>
  );
}

/* Étapes : neutres en amont, accent pendant l'échange, vert / gris en fin de parcours. */
function styleEtape(libelle: string) {
  const l = libelle.toLowerCase();
  if (l.includes("gagn")) return "bg-emerald-600 text-white ring-emerald-600";
  if (l.includes("perdu") || l.includes("pas intéress")) return "bg-stone-100 dark:bg-stone-800 text-encre-3 ring-stone-200 dark:ring-stone-700 line-through decoration-stone-300 dark:decoration-stone-600";
  if (l.includes("rdv") || l.includes("répondu")) return "bg-accent-doux text-rouge ring-accent/30";
  return "bg-carte text-encre-2 ring-trait-fort";
}

export function BadgeEtape({ libelle }: { libelle: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 caption-4 whitespace-nowrap ring-1 ring-inset ${styleEtape(libelle)}`}>{libelle}</span>
  );
}
