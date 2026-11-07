import type { MetadataRoute } from "next";
import { COULEUR_SURFACE } from "@/lib/pwa-ios";

// Manifest PWA servi à /manifest.webmanifest (modèle : Notion-Club/Infrastructure).
// Lu par Safari iOS (avec les balises apple-mobile-web-app-*) et les navigateurs Chromium.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Prospection LinkedIn",
    short_name: "Prospection",
    description: "Outil personnel de suivi de prospection LinkedIn.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: COULEUR_SURFACE,
    theme_color: COULEUR_SURFACE,
    categories: ["business", "productivity"],
    lang: "fr",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
