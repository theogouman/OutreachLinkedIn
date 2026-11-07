import type { MessageFil } from "@/server/donnees";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

/** Fil de messages LinkedIn. Contenu tiers : rendu en texte brut uniquement. */
export function FilMessages({ messages, nom }: { messages: MessageFil[]; nom: string }) {
  if (messages.length === 0) return <p className="text-sm text-neutral-500">Aucun message.</p>;
  return (
    <ol className="flex flex-col gap-3" aria-label={`Conversation avec ${nom}`}>
      {messages.map((m) => {
        const moi = m.sens === "sortant";
        return (
          <li key={m.id} className={`flex flex-col gap-1 ${moi ? "items-end" : "items-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                moi ? "rounded-br-md bg-[#b5443d] text-white" : "rounded-bl-md bg-[#f5f2f2] text-neutral-900 ring-1 ring-inset ring-neutral-200"
              }`}
            >
              {m.texte}
            </p>
            <time dateTime={new Date(m.envoyeAt).toISOString()} className="px-1 text-[11px] text-neutral-500">
              {moi ? "Vous" : nom.split(" ")[0]} · {fmt.format(new Date(m.envoyeAt))}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
