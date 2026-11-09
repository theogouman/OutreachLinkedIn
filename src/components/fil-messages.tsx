import type { MessageFil } from "@/server/donnees";
import { Avatar } from "./interface/elements";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

const ETAT: Record<Exclude<MessageFil["statut"], "envoye">, string> = {
  en_file: "En file · départ estimé",
  en_cours: "Envoi en cours",
  incertain: "Envoi à vérifier dans la file",
};

/** Fil de messages LinkedIn. Contenu tiers : rendu en texte brut uniquement. */
export function FilMessages({
  messages,
  nom,
  surMotif = false,
}: {
  messages: MessageFil[];
  nom: string;
  /** Posé sur le fond pointillé (.fond-conversation) : bulles reçues blanches, légendes plus foncées. */
  surMotif?: boolean;
}) {
  const legende = surMotif ? "text-encre-2" : "text-encre-3";
  if (messages.length === 0) return <p className={`body-6 ${legende}`}>Aucun message.</p>;
  return (
    <ol className="flex flex-col gap-4" aria-label={`Conversation avec ${nom}`}>
      {messages.map((m) => {
        const moi = m.sens === "sortant";
        const attente = m.statut !== "envoye";
        return (
          <li key={m.id} className={`flex animate-apparition items-end gap-2 ${moi ? "flex-row-reverse" : ""}`}>
            {!moi && <Avatar nom={nom} taille={28} />}
            <div className={`flex max-w-[80%] flex-col gap-1 ${moi ? "items-end" : "items-start"}`}>
              <p
                className={`selectionnable whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 body-6 ${
                  moi
                    ? attente
                      ? "rounded-br-md border border-dashed border-action/50 bg-accent-doux text-encre"
                      : "rounded-br-md bg-action text-white"
                    : surMotif
                      ? "rounded-bl-md bg-carte text-encre shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.05)]"
                      : "rounded-bl-md bg-bulle text-encre"
                }`}
              >
                {m.texte}
              </p>
              <time dateTime={new Date(m.envoyeAt).toISOString()} className={`px-1 caption-5 ${legende}`}>
                {m.statut === "envoye"
                  ? `${moi ? "Vous" : nom.split(" ")[0]} · ${fmt.format(new Date(m.envoyeAt))}`
                  : m.statut === "en_file"
                    ? `${ETAT.en_file} ${fmt.format(new Date(m.envoyeAt))}`
                    : ETAT[m.statut]}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
