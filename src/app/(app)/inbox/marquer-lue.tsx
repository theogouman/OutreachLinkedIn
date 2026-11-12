"use client";

import { useEffect, useRef } from "react";
import { actionMarquerLue } from "@/app/actions";

/**
 * Marque la conversation comme lue à son ouverture, une fois par ouverture. Une conversation
 * remise en non lue pendant qu'elle est affichée le reste : elle ne sera relue qu'à la
 * prochaine ouverture.
 */
export function MarquerLue({ id, nonLu }: { id: string; nonLu: boolean }) {
  const ouverte = useRef<string | null>(null);
  useEffect(() => {
    if (ouverte.current === id) return;
    ouverte.current = id;
    if (nonLu) void actionMarquerLue(id);
  }, [id, nonLu]);
  return null;
}
