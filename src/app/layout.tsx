import type { Metadata } from "next";
import "./globals.css";
import { Fournisseurs } from "@/components/interface/fournisseurs";

export const metadata: Metadata = {
  title: "Prospection LinkedIn",
  description: "Outil personnel de suivi de prospection LinkedIn",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-surface text-encre">
        <Fournisseurs>{children}</Fournisseurs>
      </body>
    </html>
  );
}
