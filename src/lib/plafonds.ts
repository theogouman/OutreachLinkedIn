/**
 * Plafonds d'un compte LinkedIn gratuit (docs/plan-v1.md). Les maxima reprennent
 * la recommandation Unipile ; les mêmes valeurs sont imposées par des CHECK en base.
 */
export type TypeQuota = "invitation" | "note_invitation" | "lecture_profil" | "message" | "lecture_liste";

export interface Bornes {
  jour: number | null;
  semaine: number | null;
  mois: number | null;
}

export const MAXIMA: Record<TypeQuota, Bornes> = {
  invitation: { jour: 30, semaine: 150, mois: null },
  note_invitation: { jour: null, semaine: null, mois: 5 },
  lecture_profil: { jour: 80, semaine: null, mois: null },
  message: { jour: 100, semaine: null, mois: null },
  lecture_liste: { jour: 4, semaine: null, mois: null },
};

export const LIBELLES_QUOTA: Record<TypeQuota, string> = {
  invitation: "Invitations",
  note_invitation: "Notes d'invitation",
  lecture_profil: "Lectures de profil",
  message: "Messages",
  lecture_liste: "Synchronisations",
};

export const TYPES_QUOTA = Object.keys(MAXIMA) as TypeQuota[];
