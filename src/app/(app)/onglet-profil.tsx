import { IconeLienExterne } from "@/components/icones";
import type { ProfilLinkedIn } from "@/lib/profil-linkedin";

/*
 * Onglet « Profil » de la fiche : profil LinkedIn issu de l'enrichissement (déjà revalidé côté
 * serveur). Tout est rendu en texte ; seuls les liens https revalidés sont cliquables.
 */

const fmtDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
const fmtNombre = new Intl.NumberFormat("fr-FR");

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={titre}>
      <h3 className="caption-4 text-encre-3">{titre}</h3>
      {children}
    </section>
  );
}

function Lien({ href, libelle }: { href: string; libelle: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-action underline-offset-2 outline-none hover:underline focus-visible:underline"
    >
      <span className="break-all">{libelle}</span>
      <IconeLienExterne taille={11} />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function Lignes({ lignes }: { lignes: { t: string; d: React.ReactNode }[] }) {
  if (!lignes.length) return null;
  return (
    <dl className="flex flex-col divide-y divide-trait overflow-hidden rounded-2xl ring-1 ring-trait">
      {lignes.map((l) => (
        <div key={l.t} className="flex flex-col gap-1 bg-carte px-4 py-3 sm:flex-row sm:gap-4">
          <dt className="caption-4 text-encre-3 sm:w-36 sm:shrink-0 sm:pt-0.5">{l.t}</dt>
          <dd className="selectionnable min-w-0 whitespace-pre-wrap break-words body-6 text-encre">{l.d}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OngletProfil({ profil }: { profil: ProfilLinkedIn }) {
  const e = profil.entreprise;
  const contact = [
    profil.email && { t: "E-mail", d: <a className="text-action underline-offset-2 hover:underline" href={`mailto:${profil.email}`}>{profil.email}</a> },
    profil.localisation && { t: "Localisation", d: profil.localisation },
    (profil.relations !== null || profil.abonnes !== null) && {
      t: "Audience",
      d: [
        profil.relations !== null && `${fmtNombre.format(profil.relations)} relations`,
        profil.abonnes !== null && `${fmtNombre.format(profil.abonnes)} abonnés`,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ].filter(Boolean) as { t: string; d: React.ReactNode }[];
  const entreprise = e
    ? ([
        e.nom && { t: "Nom", d: e.nom },
        e.secteur && { t: "Secteur", d: e.secteur },
        e.taille && { t: "Taille", d: `${e.taille} salariés sur LinkedIn` },
        e.siege && { t: "Siège", d: e.siege },
        e.creation && { t: "Création", d: String(e.creation) },
        e.site && { t: "Site", d: <Lien href={e.site} libelle={new URL(e.site).hostname} /> },
        e.linkedin && { t: "Page LinkedIn", d: <Lien href={e.linkedin} libelle="Ouvrir" /> },
        e.description && { t: "Description", d: e.description },
      ].filter(Boolean) as { t: string; d: React.ReactNode }[])
    : [];

  return (
    <div className="flex flex-col gap-6">
      {profil.titre && <p className="selectionnable body-6 text-encre">{profil.titre}</p>}
      {contact.length > 0 && (
        <Bloc titre="Contact">
          <Lignes lignes={contact} />
        </Bloc>
      )}
      {profil.aPropos && (
        <Bloc titre="À propos">
          <p className="selectionnable whitespace-pre-wrap break-words rounded-2xl bg-carte px-4 py-3 body-6 text-encre ring-1 ring-trait">
            {profil.aPropos}
          </p>
        </Bloc>
      )}
      {entreprise.length > 0 && (
        <Bloc titre="Entreprise actuelle">
          <Lignes lignes={entreprise} />
        </Bloc>
      )}
      {profil.experiences.length > 0 && (
        <Bloc titre="Expériences">
          <ol className="relative ml-1 flex flex-col gap-4 border-l border-trait py-1 pl-5">
            {profil.experiences.map((x, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-[25.5px] top-1.5 size-2.5 rounded-full ring-4 ring-carte ${x.actuel ? "bg-accent" : "bg-trait-fort"}`}
                />
                <p className="title-4 text-encre">
                  {x.poste}
                  {x.entreprise && <span className="font-normal text-encre-2"> · {x.entreprise}</span>}
                </p>
                {(x.periode || x.lieu) && <p className="caption-5 text-encre-3">{[x.periode, x.lieu].filter(Boolean).join(" · ")}</p>}
                {x.description && (
                  <p className="selectionnable mt-1 line-clamp-4 whitespace-pre-wrap break-words caption-5 text-encre-2">{x.description}</p>
                )}
              </li>
            ))}
          </ol>
        </Bloc>
      )}
      {profil.formation.length > 0 && (
        <Bloc titre="Formation">
          <ul className="flex flex-col gap-3">
            {profil.formation.map((f, i) => (
              <li key={i}>
                <p className="title-4 text-encre">{f.ecole}</p>
                {(f.diplome || f.domaine || f.periode) && (
                  <p className="caption-5 text-encre-3">{[f.diplome, f.domaine, f.periode].filter(Boolean).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        </Bloc>
      )}
      <p className="caption-5 text-encre-3">
        Données LinkedIn{profil.luLe ? ` lues le ${fmtDate.format(profil.luLe)}` : ""}
        {profil.avant && (profil.avant.poste || profil.avant.entreprise)
          ? ` · avant : ${[profil.avant.poste, profil.avant.entreprise].filter(Boolean).join(" · ")}`
          : ""}
      </p>
    </div>
  );
}
