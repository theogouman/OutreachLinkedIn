"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ReglageExtensible } from "@/components/interface/reglage-extensible";
import { sectionDepuis, type SectionReglages } from "@/lib/reglages";

export interface SectionMaitre {
  cle: SectionReglages;
  icone: ReactNode;
  titre: string;
  description?: string;
  resume: string;
  alerte?: boolean;
  contenu: ReactNode;
}

/**
 * Page maître des Réglages : un encadré extensible par réglage, un seul ouvert à la fois.
 * L'URL fait foi (?section=…, liste fermée) : lien direct, lien du menu Statuts, ancienne route
 * /file. Ouvrir ou fermer met l'URL à jour sans navigation (history.replaceState).
 */
export function ReglagesMaitre({ sections }: { sections: SectionMaitre[] }) {
  const params = useSearchParams();
  const depuisUrl = sectionDepuis(params.get("section"));
  const [ouverte, setOuverte] = useState<SectionReglages | null>(depuisUrl);

  // Lien suivi alors que la page est déjà affichée (menu Statuts) : ajusté pendant le rendu.
  const [urlVue, setUrlVue] = useState(depuisUrl);
  if (urlVue !== depuisUrl) {
    setUrlVue(depuisUrl);
    setOuverte(depuisUrl);
  }

  const choisir = (cle: SectionReglages | null) => {
    setOuverte(cle);
    const q = new URLSearchParams(window.location.search);
    if (cle) q.set("section", cle);
    else q.delete("section");
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  };

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s) => (
        <ReglageExtensible
          key={s.cle}
          id={s.cle}
          icone={s.icone}
          titre={s.titre}
          description={s.description}
          resume={s.resume}
          alerte={s.alerte}
          ouvert={ouverte === s.cle}
          onOuvrir={() => choisir(s.cle)}
          onFermer={() => choisir(null)}
        >
          {s.contenu}
        </ReglageExtensible>
      ))}
    </div>
  );
}
