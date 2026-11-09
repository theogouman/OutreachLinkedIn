import { NextResponse } from "next/server";
import { poolServeur } from "@/server/db";
import { envUnipile, envWebhook } from "@/server/env-serveur";
import { TAILLE_MAX_WEBHOOK, traiterWebhookUnipile } from "@/server/webhooks/unipile";
import { clientLinkedIn } from "@/server/unipile/fabrique";
import { secretsWebhookUnipile } from "@/server/webhooks/secret";

/** Webhooks Unipile v2. Réponse attendue en moins de 5 s : traitement court et idempotent. */
export async function POST(request: Request) {
  let env: ReturnType<typeof envWebhook>;
  try {
    env = envWebhook();
  } catch (e) {
    console.error("[webhook]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const longueur = Number(request.headers.get("content-length") ?? 0);
  if (longueur > TAILLE_MAX_WEBHOOK) return NextResponse.json({ ok: false }, { status: 413 });

  try {
    const corps = await request.text();
    const r = await traiterWebhookUnipile(poolServeur(), corps, request.headers.get("unipile-signature"), {
      secret: env.UNIPILE_WEBHOOK_SECRET,
      secretsSecours: async () => {
        const u = envUnipile();
        return u.mode === "reel" ? secretsWebhookUnipile({ apiKey: u.apiKey, baseUrl: u.baseUrl, chemin: "/api/webhooks/unipile" }) : [];
      },
      accountId: env.UNIPILE_ACCOUNT_ID,
      deps: {
        lireInterlocuteur: async (chatId) => {
          const r = await clientLinkedIn().lireConversation(chatId);
          return r.ok ? r.donnees.interlocuteurId : null;
        },
      },
    });
    return NextResponse.json(r.corps, { status: r.status });
  } catch (e) {
    console.error("[webhook] traitement en erreur", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
