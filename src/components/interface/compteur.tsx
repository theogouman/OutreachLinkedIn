"use client";

/**
 * Champ numérique à boutons − / + (inspiré du stepper adaptatif de rare-ui).
 * La saisie au clavier reste possible ; la valeur est toujours bornée.
 */
export function Compteur({
  valeur,
  min,
  max,
  pas = 1,
  libelle,
  onChange,
}: {
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  libelle: string;
  onChange: (v: number) => void;
}) {
  const borner = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const btn =
    "grid size-8 place-items-center text-encre-2 outline-none transition-[background-color,transform] duration-150 hover:bg-creux active:scale-95 focus-visible:bg-accent-doux disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <span className="inline-flex w-fit self-start items-center overflow-hidden rounded-lg bg-carte shadow-[inset_0_0_0_1px_var(--color-trait-fort)]">
      <button type="button" className={btn} aria-label={`Diminuer : ${libelle}`} disabled={valeur <= min} onClick={() => onChange(borner(valeur - pas))}>
        <svg viewBox="0 0 256 256" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={20} strokeLinecap="round" aria-hidden>
          <path d="M40 128h176" />
        </svg>
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        required
        aria-label={libelle}
        value={valeur}
        onChange={(e) => onChange(borner(Number(e.target.value)))}
        className="w-12 border-x border-trait bg-transparent py-1.5 text-center title-4 tabular-nums text-encre outline-none [appearance:textfield] focus-visible:bg-accent-doux [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={btn} aria-label={`Augmenter : ${libelle}`} disabled={valeur >= max} onClick={() => onChange(borner(valeur + pas))}>
        <svg viewBox="0 0 256 256" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={20} strokeLinecap="round" aria-hidden>
          <path d="M40 128h176M128 40v176" />
        </svg>
      </button>
    </span>
  );
}
