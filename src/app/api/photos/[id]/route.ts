import { z } from "zod";
import { exigerUtilisateur } from "@/server/auth";
import { photoProspect } from "@/server/donnees";

/**
 * Photo de profil d'un prospect, servie par l'outil (utilisateur connecté et autorisé).
 * Contenu vérifié à l'enregistrement (signature JPEG/PNG/WebP) ; jamais interprété ici.
 */
export async function GET(_requete: Request, ctx: { params: Promise<{ id: string }> }) {
  await exigerUtilisateur();
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const photo = await photoProspect(id.data);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.contenu), {
    headers: {
      "content-type": photo.type,
      "cache-control": "private, max-age=604800, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
