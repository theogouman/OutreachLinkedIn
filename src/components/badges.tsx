import { LIBELLES_STATUT, type StatutRelation } from "@/lib/statut-relation";

const COULEURS_STATUT: Record<StatutRelation, string> = {
  en_relation: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  en_attente: "bg-amber-50 text-amber-700 ring-amber-200",
  invitation_recue: "bg-sky-50 text-sky-700 ring-sky-200",
  a_inviter: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

export function BadgeStatut({ statut }: { statut: string }) {
  const s = (statut in LIBELLES_STATUT ? statut : "a_inviter") as StatutRelation;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${COULEURS_STATUT[s]}`}>
      {LIBELLES_STATUT[s]}
    </span>
  );
}

export function BadgeEtape({ libelle }: { libelle: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#e0625a]/10 px-2 py-0.5 text-xs font-medium text-[#b3403a] ring-1 ring-inset ring-[#e0625a]/25">
      {libelle}
    </span>
  );
}
