"use client";

import type { ReactNode } from "react";
import Avatar from "../Avatar";
import { useLanguage, useT } from "../../lib/i18n";
import MediaThumb, { DurationBadge, PlayIcon, type Media } from "./MediaThumb";

export type PostAuthor = { name: string; avatar: string | null; verified?: boolean };

// Publication du fil : auteur, texte, vidéo (vignette avec lecture et durée), puis j'aime, commentaires et partages.
// inactive : les boutons restent cliquables mais ne font rien d'autre qu'appeler leur fonction (qui annonce « Bientôt »).
export default function PostCard({
  author,
  timeLabel,
  text,
  media,
  duration,
  likes,
  comments,
  shares,
  onLike,
  onComment,
  onShare,
  onPlay,
  inactive = false,
}: {
  author: PostAuthor;
  timeLabel: string;
  text: string;
  media: Media;
  duration?: string;
  likes: number;
  comments: number;
  shares: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onPlay: () => void;
  inactive?: boolean;
}) {
  const t = useT();
  const language = useLanguage();
  const format = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { notation: "compact" });

  return (
    <article aria-label={t("home.postBy").replace("{name}", author.name)} className="rounded-2xl border border-line bg-surface p-3">
      <header className="flex items-center gap-3">
        <Avatar src={author.avatar} initial={author.name.charAt(0).toUpperCase()} alt="" size={44} neon />
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-bold leading-tight">
            {author.name}
            {author.verified && (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent-ink" fill="currentColor">
                <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z" />
                <path d="M8.5 12.2l2.3 2.3 4.7-4.7" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </p>
          <p className="text-xs text-muted">{timeLabel}</p>
        </div>
      </header>

      <p className="mt-3 whitespace-pre-line text-sm leading-snug">{text}</p>

      <button
        type="button"
        onClick={onPlay}
        aria-disabled={inactive || undefined}
        aria-label={duration ? t("home.playTitled").replace("{title}", text.split("\n")[0]).replace("{d}", duration) : media.alt}
        className="relative mt-3 block aspect-video w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        <MediaThumb media={media} sizes="(max-width: 500px) 100vw, 476px" />
        <span aria-hidden="true" className="absolute inset-0 bg-black/20" />
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/80 bg-black/50 text-white backdrop-blur-sm"
        >
          <PlayIcon className="ml-1 h-7 w-7" />
        </span>
        {duration && <DurationBadge duration={duration} />}
      </button>

      <div className="mt-1 flex items-center gap-1">
        <Action label={t("home.likes").replace("{n}", String(likes))} count={format.format(likes)} onClick={onLike} inactive={inactive}>
          <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 3 1.3-1.9 2.9-3 4.9-3 3.5 0 5.4 3.5 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
        </Action>
        <Action label={t("home.comments").replace("{n}", String(comments))} count={format.format(comments)} onClick={onComment} inactive={inactive}>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
        </Action>
        <Action label={t("home.shares").replace("{n}", String(shares))} count={format.format(shares)} onClick={onShare} inactive={inactive}>
          <path d="M14 5l7 7-7 7M21 12H10a7 7 0 0 0-7 7" />
        </Action>
      </div>
    </article>
  );
}

function Action({
  label,
  count,
  onClick,
  inactive,
  children,
}: {
  label: string;
  count: string;
  onClick: () => void;
  inactive: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={inactive || undefined}
      aria-label={label}
      className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
