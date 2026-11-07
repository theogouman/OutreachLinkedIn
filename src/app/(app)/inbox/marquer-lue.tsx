"use client";

import { useEffect } from "react";
import { actionMarquerLue } from "@/app/actions";

/** Marque la conversation ouverte comme lue (une fois, à l'ouverture). */
export function MarquerLue({ id, nonLu }: { id: string; nonLu: boolean }) {
  useEffect(() => {
    if (nonLu) void actionMarquerLue(id);
  }, [id, nonLu]);
  return null;
}
