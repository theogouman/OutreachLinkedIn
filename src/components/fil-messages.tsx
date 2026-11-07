import type { MessageFil } from "@/server/donnees";
import { Avatar } from "./interface/elements";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

/** Fil de messages LinkedIn. Contenu tiers : rendu en texte brut uniquement. */
export function FilMessages({ messages, nom }: { messages: MessageFil[]; nom: string }) {
  if (messages.length === 0) return <p className="body-6 text-encre-3">Aucun message.</p>;
  return (
    <ol className="flex flex-col gap-4" aria-label={`Conversation avec ${nom}`}>
      {messages.map((m) => {
        const moi = m.sens === "sortant";
        return (
          <li key={m.id} className={`flex animate-apparition items-end gap-2 ${moi ? "flex-row-reverse" : ""}`}>
            {!moi && <Avatar nom={nom} taille={28} />}
            <div className={`flex max-w-[80%] flex-col gap-1 ${moi ? "items-end" : "items-start"}`}>
              <p
                className={`selectionnable whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 body-6 ${
                  moi ? "rounded-br-md bg-action text-white" : "rounded-bl-md bg-creux text-encre ring-1 ring-inset ring-trait"
                }`}
              >
                {m.texte}
              </p>
              <time dateTime={new Date(m.envoyeAt).toISOString()} className="px-1 caption-5 text-encre-3">
                {moi ? "Vous" : nom.split(" ")[0]} · {fmt.format(new Date(m.envoyeAt))}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
