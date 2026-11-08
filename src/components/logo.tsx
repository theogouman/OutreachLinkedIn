/**
 * Logo de l'outil (logo-glow.svg, fourni par l'utilisateur) : tracé blanc à halo,
 * donc toujours posé sur une tuile sombre pour rester visible sur les fonds clairs.
 */
export function Logo({ taille = 36, className = "" }: { taille?: number; className?: string }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center bg-sombre ${className}`}
      style={{ width: taille, height: taille, borderRadius: taille * 0.28 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, aucune optimisation utile */}
      <img src="/logo-glow.svg" alt="" width={taille * 0.82} height={taille * 0.82} draggable={false} />
    </span>
  );
}
