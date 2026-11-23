"use client";

import { useT } from "../../lib/i18n";
import MediaThumb, { DurationBadge, PlayIcon, type Media } from "./MediaThumb";

// Vignette verticale de la rangée « Vidéos populaires » : image, petit bouton de lecture, durée et titre dessous.
export default function VideoCard({
  title,
  media,
  duration,
  onPlay,
  inactive = false,
}: {
  title: string;
  media: Media;
  duration: string;
  onPlay: () => void;
  inactive?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-disabled={inactive || undefined}
      aria-label={t("home.playTitled").replace("{title}", title).replace("{d}", duration)}
      className="group block w-32 shrink-0 text-left focus-visible:outline-none"
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-line group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-ink">
        <MediaThumb media={media} sizes="128px" />
        <span
          aria-hidden="true"
          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
        </span>
        <DurationBadge duration={duration} />
      </span>
      <span aria-hidden="true" className="mt-1.5 line-clamp-2 block text-xs font-semibold leading-tight">
        {title}
      </span>
    </button>
  );
}
