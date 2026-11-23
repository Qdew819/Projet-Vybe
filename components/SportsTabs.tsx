"use client";

import Link from "next/link";
import { useT } from "../lib/i18n";
import { LEVEL_LABEL, LEVEL_LOWER, type UserSport } from "../lib/userSports";

// Onglets des sports du profil (comme sur la maquette) : le sport actif est en vert plein, avec le niveau en petit.
// « + Autres » à la fin (seulement sur mon profil) mène à la page « Sports et niveaux ».
// Rien n'est affiché s'il n'y a aucun sport.
export default function SportsTabs({
  sports,
  activeId,
  onSelect,
  editHref,
  opensDialog = false,
}: {
  sports: UserSport[];
  activeId: number | null;
  onSelect: (id: number) => void;
  editHref?: string;
  opensDialog?: boolean; // la pastille ouvre une fenêtre (mon profil : niveau ou retrait)
}) {
  const t = useT();
  if (sports.length === 0) return null;

  const pill =
    "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

  return (
    // Défilement horizontal quand il y a beaucoup de sports (barre de défilement cachée)
    <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label={t("sports.tabsLabel")} className="flex w-max gap-2 py-1">
        {sports.map(({ sport, level }) => {
          const active = sport.id === activeId;
          return (
            <button
              key={sport.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-haspopup={opensDialog ? "dialog" : undefined}
              aria-label={t("sports.pillLabel").replace("{name}", sport.name).replace("{level}", t(LEVEL_LOWER[level]))}
              onClick={() => onSelect(sport.id)}
              className={`${pill} ${
                active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-foreground hover:border-accent-ink"
              }`}
            >
              <span aria-hidden="true">{sport.emoji}</span>
              {sport.name}
              <span aria-hidden="true" className={`text-[11px] font-semibold ${active ? "text-on-accent/75" : "text-muted"}`}>
                {t(LEVEL_LABEL[level])}
              </span>
            </button>
          );
        })}
        {editHref && (
          <Link href={editHref} className={`${pill} border-line bg-surface text-foreground hover:border-accent-ink`}>
            <span aria-hidden="true" className="text-base leading-none text-accent-ink">
              +
            </span>
            {t("sports.others")}
          </Link>
        )}
      </div>
    </div>
  );
}
