import type { ComponentProps, ReactNode } from "react";

/* Teintes d'avatar sombres (fonds des tags), initiales en encre claire. */
const TEINTES = ["#3e1d1e", "#1d2b3e", "#1f3a2d", "#31221b", "#231f3a", "#102a27", "#33301a"];

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
      className="inline-grid shrink-0 place-items-center rounded-full caption-3 text-encre ring-1 ring-white/10"
      style={{ width: taille, height: taille, background: teinte(nom), fontSize: taille <= 20 ? 9 : taille < 32 ? 11 : undefined }}
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

/**
 * Barre d'outils de page (sales-crm) : le titre est dans l'en-tête de la coque ; ici la
 * description à gauche et les actions à droite.
 */
export function EnTetePage({ description, actions }: { titre?: string; description?: string; actions?: ReactNode }) {
  if (!description && !actions) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
      {description ? <p className="max-w-[680px] caption-4 text-encre-3">{description}</p> : <span />}
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>}
    </div>
  );
}

export function EtatVide({ icone, titre, texte, action }: { icone: ReactNode; titre: string; texte: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-muet text-icone shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.1)]">{icone}</span>
      <h2 className="heading-6 text-encre">{titre}</h2>
      <p className="max-w-[420px] caption-5 text-encre-3">{texte}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* Squelettes en forme du vrai contenu (ai-design-skills B9, transitions.dev 14). */
export function SqueletteLignes({ lignes = 8 }: { lignes?: number }) {
  return (
    <div className="border-y border-trait" aria-busy="true" aria-label="Chargement">
      <div className="h-[38px] border-b border-trait" />
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="flex h-[43px] items-center gap-3 border-b border-trait px-4 last:border-0">
          <span className="squelette size-5 rounded-full" />
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

/** Onglets soulignés (Tabs sales-crm), en liens : le filtrage reste côté serveur. */
export function Onglets({ libelle, onglets }: { libelle: string; onglets: { href: string; libelle: string; compte?: number; actif: boolean }[] }) {
  return (
    <nav aria-label={libelle} className="flex items-center gap-4 overflow-x-auto border-b border-trait px-4">
      {onglets.map((o) => (
        <a
          key={o.href}
          href={o.href}
          aria-current={o.actif ? "page" : undefined}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b py-4 caption-4 leading-none outline-none transition-[color,border-color] duration-150 ease-[var(--ease-sortie)] focus-visible:text-encre ${
            o.actif ? "border-encre text-encre" : "border-transparent text-encre-3 hover:text-encre-2"
          }`}
        >
          {o.libelle}
          {o.compte !== undefined && <span className="tabular-nums text-encre-3">{o.compte}</span>}
        </a>
      ))}
    </nav>
  );
}

/** Filtre « libellé | valeur » (FilterMenu sales-crm), sur une liste déroulante native. */
export function FiltrePilule({ libelle, children, ...props }: { libelle: string; children: ReactNode } & ComponentProps<"select">) {
  return (
    <label className="bouton group relative h-[30px] gap-0 overflow-hidden p-0 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent/70">
      <span className="px-[9px] font-normal text-encre-3">{libelle}</span>
      <span aria-hidden className="h-full w-px bg-white/[0.08]" />
      <select
        {...props}
        className="h-full cursor-pointer appearance-none bg-transparent pl-[9px] pr-7 text-[12px] text-encre outline-none [&>option]:bg-surface"
      >
        {children}
      </select>
      <svg viewBox="0 0 256 256" aria-hidden className="pointer-events-none absolute right-[9px] size-3 text-[#898b8d]" fill="currentColor">
        <path d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z" />
      </svg>
    </label>
  );
}
