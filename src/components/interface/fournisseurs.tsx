"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { FournisseurToasts } from "./toasts";

/** Animations désactivées si le système le demande ; notifications globales. */
export function Fournisseurs({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <FournisseurToasts>{children}</FournisseurToasts>
    </MotionConfig>
  );
}
