import { LIBELLES_STATUT, type StatutRelation } from "@/lib/statut-relation";

/* Tags bordés de sales-crm. Toujours un libellé en plus de la couleur. */
const STATUT: Record<StatutRelation, string> = {
  en_relation: "ton-vert",
  en_attente: "ton-ambre",
  invitation_recue: "ton-bleu",
  a_inviter: "ton-neutre",
};

export function BadgeStatut({ statut }: { statut: string }) {
  const s = (statut in LIBELLES_STATUT ? statut : "a_inviter") as StatutRelation;
  return <span className={`tag ${STATUT[s]}`}>{LIBELLES_STATUT[s]}</span>;
}

/* Étapes : neutres en amont, bleu au premier contact, violet pendant l'échange, vert ou rouge à la fin. */
function tonEtape(libelle: string) {
  const l = libelle.toLowerCase();
  if (l.includes("gagn")) return "ton-vert";
  if (l.includes("perdu") || l.includes("pas intéress")) return "ton-rouge";
  if (l.includes("rdv")) return "ton-teal";
  if (l.includes("répondu")) return "ton-violet";
  if (l.includes("relance")) return "ton-orange";
  if (l.includes("message") || l.includes("connect") || l.includes("invitation")) return "ton-bleu";
  return "ton-neutre";
}

export function BadgeEtape({ libelle }: { libelle: string }) {
  return <span className={`tag ${tonEtape(libelle)}`}>{libelle}</span>;
}
