"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "../lib/i18n";
import { countUnread, fetchHiddenTypes } from "../lib/notifications";
import { createClient } from "../lib/supabase/client";

// Cloche de l'accueil : pastille verte avec le nombre de notifications non lues (« 9+ » au-delà de 9, cachée à 0).
// Compte au chargement, se met à jour en temps réel (INSERT et UPDATE sur notifications) et quand la fenêtre
// reprend le focus. Les types désactivés dans Paramètres → Notifications ne sont pas comptés.
export default function NotificationBell({ userId, className }: { userId: string; className: string }) {
  const t = useT();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;
    let hidden: string[] | null = null;

    async function recount() {
      try {
        if (hidden === null) hidden = await fetchHiddenTypes(supabase, userId);
        const count = await countUnread(supabase, userId, hidden);
        if (!cancelled) setUnread(count);
      } catch (err) {
        // Compteur indisponible : la cloche reste utilisable, sans pastille
        console.error(err);
      }
    }

    void recount();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void recount())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void recount())
      .subscribe();

    // Retour sur l'onglet : on relit aussi les réglages (ils ont pu changer dans les paramètres)
    const onFocus = () => {
      hidden = null;
      void recount();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const label = unread > 0 ? `${t("home.notifications")} (${t("notif.unreadCount").replace("{n}", String(unread))})` : t("home.notifications");

  return (
    <Link href="/notifications" aria-label={label} title={label} className={className}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-accent px-1 text-[10px] font-black leading-none text-on-accent"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
