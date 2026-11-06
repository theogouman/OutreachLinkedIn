import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospection LinkedIn",
  description: "Outil personnel de suivi de prospection LinkedIn",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[#f5f2f2] text-neutral-900">{children}</body>
    </html>
  );
}
