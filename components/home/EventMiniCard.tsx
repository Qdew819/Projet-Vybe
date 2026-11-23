"use client";

import { useT } from "../../lib/i18n";
import MediaThumb, { type Media } from "./MediaThumb";

const metaIcon = "h-3.5 w-3.5 shrink-0 text-accent-ink";

// Carte compacte d'un événement (accueil) : image à gauche, titre, lieu, date et participants, bouton « S'inscrire ».
// inactive : le bouton reste cliquable mais n'inscrit personne (onRegister annonce « Bientôt »).
export default function EventMiniCard({
  title,
  place,
  dateLabel,
  participants,
  media,
  onRegister,
  inactive = false,
}: {
  title: string;
  place: string;
  dateLabel: string;
  participants: number;
  media: Media;
  onRegister: () => void;
  inactive?: boolean;
}) {
  const t = useT();
  return (
    <article className="flex gap-3 rounded-2xl border border-line bg-surface p-2.5">
      <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl">
        <MediaThumb media={media} sizes="112px" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight">{title}</h3>
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="0 0 24 24" className={metaIcon} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="truncate">{place}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="0 0 24 24" className={metaIcon} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
            </svg>
            <span className="truncate">{dateLabel}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="0 0 24 24" className={metaIcon} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
            </svg>
            <span className="truncate">{t("home.participants").replace("{n}", String(participants))}</span>
          </li>
        </ul>
      </div>

      <div className="flex shrink-0 items-end">
        <button
          type="button"
          onClick={onRegister}
          aria-disabled={inactive || undefined}
          aria-label={t("home.registerTo").replace("{title}", title)}
          className="min-h-11 rounded-full bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {t("home.register")}
        </button>
      </div>
    </article>
  );
}
