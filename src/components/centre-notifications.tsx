"use client";

/*
 * Centre de notifications : cloche dans la barre (pastille rouge = non lues, rouge plein = alerte),
 * panneau des dernières notifications, et activation des notifications Push sur l'appareil
 * (PWA ; sur iPhone, uniquement depuis l'app installée sur l'écran d'accueil).
 */

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { actionAbonnerPush, actionClePush, actionDesabonnerPush, actionNotificationsLues } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { IconeCloche } from "@/components/icones";
import type { NotificationAffichee } from "@/server/notifications";

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

type EtatPush = "verification" | "actif" | "inactif" | "refuse" | "installer" | "indisponible";

function cleEnOctets(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

function usePush() {
  const [etat, setEtat] = useState<EtatPush>("verification");
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();

  useEffect(() => {
    let annule = false;
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const installee = window.matchMedia("(display-mode: standalone)").matches;
      let e: EtatPush;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) e = ios && !installee ? "installer" : "indisponible";
      else if (Notification.permission === "denied") e = "refuse";
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        e = (await reg?.pushManager.getSubscription()) ? "actif" : "inactif";
      }
      if (!annule) setEtat(e);
    })().catch(() => !annule && setEtat("indisponible"));
    return () => {
      annule = true;
    };
  }, []);

  const activer = () =>
    demarrer(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setEtat(permission === "denied" ? "refuse" : "inactif");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const abonnement = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(await actionClePush()) });
      const r = await actionAbonnerPush(abonnement.toJSON());
      retourner(r);
      if (r.ok) setEtat("actif");
    });

  const desactiver = () =>
    demarrer(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      if (abonnement) {
        retourner(await actionDesabonnerPush(abonnement.endpoint));
        await abonnement.unsubscribe();
      }
      setEtat("inactif");
    });

  return { etat, enCours, activer, desactiver };
}

function BlocPush() {
  const { etat, enCours, activer, desactiver } = usePush();
  const textes: Record<EtatPush, string> = {
    verification: "Vérification…",
    actif: "Notifications activées sur cet appareil",
    inactif: "Reçois les alertes (compte déconnecté…) sur cet appareil",
    refuse: "Notifications bloquées : autorise-les dans les réglages du navigateur",
    installer: "Sur iPhone : ajoute l'app à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis active les notifications depuis l'app",
    indisponible: "Ce navigateur ne prend pas en charge les notifications",
  };
  return (
    <div className="flex items-center justify-between gap-3 border-t border-trait px-4 py-3">
      <p className="caption-5 text-encre-3">{textes[etat]}</p>
      {etat === "inactif" && (
        <button type="button" onClick={activer} disabled={enCours} className="bouton bouton-plein shrink-0 px-3 py-1.5 caption-3">
          Activer
        </button>
      )}
      {etat === "actif" && (
        <button type="button" onClick={desactiver} disabled={enCours} className="bouton bouton-discret shrink-0 px-3 py-1.5 caption-3">
          Désactiver
        </button>
      )}
    </div>
  );
}

export function CentreNotifications({ liste, nonLues }: { liste: NotificationAffichee[]; nonLues: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const racine = useRef<HTMLDivElement>(null);
  const alerte = liste.some((n) => !n.lue && n.niveau === "alerte");

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        aria-label={nonLues ? `Notifications (${nonLues} non lue${nonLues > 1 ? "s" : ""})` : "Notifications"}
        className={`relative grid h-9 w-11 place-items-center rounded-xl outline-none transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent ${alerte ? "bg-accent-doux text-action" : "bg-black/[0.05] text-encre-2 hover:bg-black/[0.08]"}`}
      >
        <IconeCloche taille={18} />
        {nonLues > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-action px-1 caption-4 tabular-nums text-white ring-2 ring-carte">
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="flottant absolute right-0 top-11 z-50 flex w-[min(360px,calc(100vw-32px))] animate-apparition flex-col overflow-hidden rounded-[20px]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <h2 className="title-4 text-encre">Notifications</h2>
            {nonLues > 0 && (
              <button
                type="button"
                disabled={enCours}
                onClick={() => demarrer(async () => void (await actionNotificationsLues()))}
                className="caption-3 text-action outline-none hover:underline focus-visible:underline"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          <ul className="max-h-[50dvh] overflow-y-auto">
            {liste.length === 0 && <li className="px-4 py-8 text-center caption-5 text-encre-3">Aucune notification pour l&apos;instant</li>}
            {liste.map((n) => {
              const contenu = (
                <>
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lue ? "bg-transparent" : n.niveau === "alerte" ? "bg-action" : "bg-accent"}`}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`body-6 ${n.niveau === "alerte" ? "text-action" : "text-encre"}`}>{n.titre}</span>
                    {n.corps && <span className="caption-5 text-encre-2">{n.corps}</span>}
                    <time dateTime={new Date(n.creeeLe).toISOString()} className="caption-5 text-encre-3">
                      {fmt.format(new Date(n.creeeLe))}
                    </time>
                  </span>
                </>
              );
              const classe = "flex gap-3 px-4 py-3 outline-none transition-colors duration-150 hover:bg-creux focus-visible:bg-creux";
              return (
                <li key={n.id} className="border-t border-trait first:border-0">
                  {n.lien ? (
                    <Link href={n.lien} onClick={() => setOuvert(false)} className={classe}>
                      {contenu}
                    </Link>
                  ) : (
                    <div className={classe}>{contenu}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <BlocPush />
        </div>
      )}
    </div>
  );
}
