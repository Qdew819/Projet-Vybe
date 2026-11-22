"use client";

import { useLanguage, useT } from "../lib/i18n";
import { getSport, sportName } from "../lib/sports";

// Onglets des sports du profil (comme sur la maquette) : le sport actif est en vert plein,
// et « + Autres » à la fin ouvre la fenêtre pour choisir ses sports.
export default function SportsTabs({
  sportIds,
  activeId,
  onSelect,
  onEdit,
}: {
  sportIds: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const sports = sportIds.map(getSport).filter((sport) => sport !== undefined);

  const pill =
    "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

  return (
    // Défilement horizontal quand il y a beaucoup de sports (barre de défilement cachée)
    <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label={t("sports.tabsLabel")} className="flex w-max gap-2 py-1">
        {sports.map((sport) => {
          const active = sport.id === activeId;
          return (
            <button
              key={sport.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(sport.id)}
              className={`${pill} ${
                active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-foreground hover:border-accent-ink"
              }`}
            >
              <span aria-hidden="true">{sport.emoji}</span>
              {sportName(sport, language)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onEdit}
          aria-haspopup="dialog"
          className={`${pill} border-line bg-surface text-foreground hover:border-accent-ink`}
        >
          <span aria-hidden="true" className="text-base leading-none text-accent-ink">
            +
          </span>
          {sports.length === 0 ? t("sports.add") : t("sports.others")}
        </button>
      </div>
    </div>
  );
}
