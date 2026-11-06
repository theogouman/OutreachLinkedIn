"use client";

import { useEffect, useState } from "react";
import type { Retour } from "@/app/actions";

/** Message de retour d'une action (zone annoncée aux lecteurs d'écran), masqué après 6 s. */
export function Notification({ retour }: { retour: Retour | null }) {
  const [masque, setMasque] = useState<Retour | null>(null);
  useEffect(() => {
    if (!retour) return;
    const t = setTimeout(() => setMasque(retour), 6000);
    return () => clearTimeout(t);
  }, [retour]);
  const visible = retour && retour !== masque ? retour : null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50">
      {visible && (
        <p
          className={`animate-apparition pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
            visible.ok ? "bg-white text-neutral-800 ring-neutral-200" : "bg-[#fff5f4] text-[#b3403a] ring-[#e0625a]/30"
          }`}
        >
          {visible.message}
        </p>
      )}
    </div>
  );
}
