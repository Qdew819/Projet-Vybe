"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT, type MessageKey } from "../lib/i18n";

const TABS: { id: string; label: MessageKey }[] = [
  { id: "publications", label: "myProfile.tab.posts" },
  { id: "evenements", label: "myProfile.tab.events" },
  { id: "favoris", label: "myProfile.tab.favorites" },
  { id: "activite", label: "myProfile.tab.activity" },
];

// Onglets du profil (Publications, Événements, Favoris, Activité).
// Clavier : flèches gauche/droite, Début et Fin changent d'onglet ; Tab passe au contenu.
// « Publications » : sous-onglets Posts / Vidéos (publications) ; les autres onglets affichent encore « Bientôt ».
export default function ProfileTabs({ publications }: { publications?: ReactNode }) {
  const t = useT();
  const baseId = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const next = (index + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") select(active + 1);
    else if (e.key === "ArrowLeft") select(active - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(TABS.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div>
      <div role="tablist" aria-label={t("myProfile.tabsLabel")} onKeyDown={onKeyDown} className="grid grid-cols-4 border-b border-line">
        {TABS.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={`relative min-h-12 truncate px-1 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink sm:text-sm ${
                selected ? "text-accent-ink" : "text-muted hover:text-foreground"
              }`}
            >
              {t(tab.label)}
              {selected && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-ink" />}
            </button>
          );
        })}
      </div>

      {TABS.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== active}
          tabIndex={0}
          className={
            tab.id === "publications" && publications
              ? "pb-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
              : "flex min-h-40 items-center justify-center text-sm font-semibold text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
          }
        >
          {tab.id === "publications" && publications ? publications : t("common.soon")}
        </div>
      ))}
    </div>
  );
}
