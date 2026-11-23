"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useT, type MessageKey } from "../lib/i18n";

export type NavTab = "accueil" | "communaute" | "evenements" | "profil";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  className: "h-6 w-6",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Tab = { id: NavTab; href: string; label: MessageKey; icon: ReactNode };

const LEFT: Tab[] = [
  {
    id: "accueil",
    href: "/accueil",
    label: "nav.home",
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
      </svg>
    ),
  },
  {
    id: "communaute",
    href: "/personnes",
    label: "nav.community",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
      </svg>
    ),
  },
];

const RIGHT: Tab[] = [
  {
    id: "evenements",
    href: "/evenements",
    label: "nav.events",
    icon: (
      // Trophée, comme la maquette
      <svg {...iconProps}>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      </svg>
    ),
  },
  {
    id: "profil",
    href: "/profil",
    label: "nav.profile",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

// Barre d'onglets fixée en bas de l'écran (pages à onglets, via AppShell).
// L'onglet actif est passé en prop : pas de usePathname ici (erreur « Blocking Route » avec les pages dynamiques).
export default function BottomNav({
  active,
  onCreate,
  createOpen = false,
}: {
  active?: NavTab;
  onCreate: () => void;
  createOpen?: boolean;
}) {
  const t = useT();

  function renderTab(tab: Tab) {
    const current = tab.id === active;
    return (
      <li key={tab.id} className="flex">
        <Link
          href={tab.href}
          aria-current={current ? "page" : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink ${
            current ? "text-accent-ink" : "text-muted hover:text-foreground"
          }`}
        >
          {tab.icon}
          <span className="max-w-full truncate">{t(tab.label)}</span>
        </Link>
      </li>
    );
  }

  return (
    <nav aria-label={t("nav.label")} className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-[500px] border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <ul className="grid grid-cols-5 items-end px-2 pt-1.5 pb-1">
          {LEFT.map(renderTab)}
          <li className="flex justify-center">
            {/* Bouton central plus grand, qui dépasse au-dessus de la barre */}
            <button
              type="button"
              onClick={onCreate}
              aria-label={t("nav.create")}
              aria-haspopup="dialog"
              aria-expanded={createOpen}
              className="-mt-7 mb-1 flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-accent text-on-accent shadow-[0_0_22px_rgba(57,255,20,0.45)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </li>
          {RIGHT.map(renderTab)}
        </ul>
      </div>
    </nav>
  );
}
