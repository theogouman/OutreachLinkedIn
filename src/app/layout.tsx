import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Fournisseurs } from "@/components/interface/fournisseurs";
import { EnregistrementServiceWorker } from "@/components/pwa/enregistrement-service-worker";
import { COULEUR_SURFACE, SPLASH_IOS } from "@/lib/pwa-ios";

// Métadonnées PWA (modèle : Notion-Club/Infrastructure) : installation depuis l'écran
// d'accueil iOS en mode plein écran, icône, nom, barre d'état.
export const metadata: Metadata = {
  title: "Prospection LinkedIn",
  description: "Outil personnel de suivi de prospection LinkedIn",
  applicationName: "Prospection",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Prospection",
    // Barre d'état transparente : la page passe dessous (marges env(safe-area-inset-*)).
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  // Next n'émet que mobile-web-app-capable ; iOS 16 et 17 préfèrent encore l'ancien nom.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// viewport-fit=cover : la page s'étend sous l'encoche. Le zoom reste permis (accessibilité) :
// l'auto-zoom iOS au focus est évité par des champs à 16 px sur mobile (globals.css).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COULEUR_SURFACE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <head>
        {/* Écrans de lancement iOS : sans image à la résolution exacte, iOS affiche du blanc. */}
        {SPLASH_IOS.map((s) => (
          <link key={s.href} rel="apple-touch-startup-image" media={s.media} href={s.href} />
        ))}
      </head>
      <body className="flex min-h-full flex-col bg-surface text-encre">
        <Fournisseurs>{children}</Fournisseurs>
        <EnregistrementServiceWorker />
      </body>
    </html>
  );
}
