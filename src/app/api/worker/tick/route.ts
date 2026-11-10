import { NextResponse } from "next/server";
import { poolServeur } from "@/server/db";
import { envUnipile, envWorker } from "@/server/env-serveur";
import { planifierSynchronisations } from "@/server/queue/planification";
import { executerUnTour } from "@/server/queue/worker";
import { jetonBearer, secretsEgaux } from "@/server/secrets";
import { appliquerEffetsUnipile, creerExecuteur, lireDestinataireDepuis, photosManquantesDepuis } from "@/server/unipile/executeur";
import { completerConversations } from "@/server/completion-conversations";
import { clientLinkedIn, dependancesCompletion } from "@/server/unipile/fabrique";

export const maxDuration = 60;

/**
 * Un passage du worker, appelé chaque minute par Supabase pg_cron avec
 * « Authorization: Bearer <WORKER_SECRET> ». Au plus une action LinkedIn.
 */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = envWorker().WORKER_SECRET;
  } catch (e) {
    console.error("[worker]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!secretsEgaux(jetonBearer(request.headers.get("authorization")), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const pool = poolServeur();
    const maintenant = new Date();
    await planifierSynchronisations(pool, maintenant);
    // Conversations à compléter (nom, photo) : lecture de la messagerie, hors quota et hors file.
    await completerConversations(pool, dependancesCompletion(), 5).catch((e) => console.error("[completion]", (e as Error).message));
    const bilan = await executerUnTour({
      pool,
      executeur: creerExecuteur(clientLinkedIn(), { lireDestinataire: lireDestinataireDepuis(pool), photosManquantes: photosManquantesDepuis(pool) }),
      appliquerEffets: appliquerEffetsUnipile,
      // Unipile simulé : seules les données de démonstration sont traitées.
      seulementDemo: envUnipile().mode === "simule",
    });
    return NextResponse.json({ ok: true, bilan });
  } catch (e) {
    console.error("[worker] tour en erreur", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
