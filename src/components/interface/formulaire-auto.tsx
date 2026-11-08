"use client";

import type { ComponentProps } from "react";

/** Formulaire GET qui se soumet dès qu'une liste ou une date change (barre de filtres). */
export function FormulaireAuto(props: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onChange={(e) => {
        const cible = e.target as HTMLElement;
        if (cible instanceof HTMLSelectElement || (cible instanceof HTMLInputElement && cible.type === "date")) {
          e.currentTarget.requestSubmit();
        }
      }}
    />
  );
}
