import type { ReactNode } from "react";

/* Teintes d'avatar : douces, lisibles en encre foncée (contraste ≥ 4,5:1). */
const TEINTES = ["#f6e3df", "#e6eef5", "#e8f1e6", "#f3ecdc", "#ece7f4", "#e4f0ef", "#f4e6ee"];

function teinte(nom: string) {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

export function Avatar({ nom, taille = 36 }: { nom: string; taille?: number }) {
  const initiales =
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full caption-3 text-encre ring-1 ring-black/5"
      style={{ width: taille, height: taille, background: teinte(nom), fontSize: taille < 32 ? 11 : undefined }}
    >
      {initiales}
    </span>
  );
}

/** Nombre qui réapparaît en « pop-in » quand il change (transitions.dev 02). */
export function Chiffre({ valeur, className = "" }: { valeur: number; className?: string }) {
  return (
    <span key={valeur} className={`inline-block animate-chiffre tabular-nums ${className}`}>
      {new Intl.NumberFormat("fr-FR").format(valeur)}
    </span>
  );
}

export function EnTetePage({ titre, description, actions }: { titre: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="heading-5 text-encre">{titre}</h1>
        {description && <p className="mt-1 max-w-[680px] body-6 text-encre-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EtatVide({ icone, titre, texte, action }: { icone: ReactNode; titre: string; texte: string; action?: ReactNode }) {
  return (
    <div className="carte flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-creux text-encre-2 ring-1 ring-trait">{icone}</span>
      <h2 className="title-3 text-encre">{titre}</h2>
      <p className="max-w-[420px] body-6 text-encre-3">{texte}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* Squelettes en forme du vrai contenu (ai-design-skills B9, transitions.dev 14). */
export function SqueletteLignes({ lignes = 8 }: { lignes?: number }) {
  return (
    <div className="carte overflow-hidden" aria-busy="true" aria-label="Chargement">
      <div className="h-10 border-b border-trait bg-creux" />
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="flex h-[60px] items-center gap-3 border-b border-trait px-4 last:border-0">
          <span className="squelette size-9 rounded-full" />
          <span className="squelette h-3 w-40" />
          <span className="squelette ml-auto h-3 w-24" />
          <span className="squelette h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SqueletteCartes({ nombre = 4 }: { nombre?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: nombre }, (_, i) => (
        <div key={i} className="carte flex flex-col gap-3 p-4">
          <span className="squelette h-3 w-24" />
          <span className="squelette h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
