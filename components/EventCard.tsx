"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatEventDate, type EventRow, type ParticipantStatus } from "../lib/events";
import { useLanguage, useT } from "../lib/i18n";
import { sportImage } from "../lib/sportImages";
import type { CatalogSport } from "../lib/userSports";

const metaIcon = "h-3.5 w-3.5 shrink-0 text-accent-ink";
const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Carte « Événements près de toi » : vignette à gauche, titre, lieu, date, participants, bouton en bas à droite.
// Toute la carte mène à /evenements/[id] ; les boutons « S'inscrire » (onJoin) et « Gérer » (onManage) agissent sur place.
// L'organisateur peut aussi s'inscrire à son propre événement : il voit alors les deux boutons.
export default function EventCard({
  event,
  sport,
  goingCount,
  isOrganizer,
  status,
  ended = false,
  tooYoung = false,
  busy = false,
  onJoin,
  onLeave,
  onManage,
}: {
  event: EventRow;
  sport?: CatalogSport;
  goingCount: number;
  isOrganizer: boolean;
  status: ParticipantStatus | null; // mon inscription à cet événement
  ended?: boolean;
  tooYoung?: boolean;
  busy?: boolean;
  onJoin?: () => void;
  onLeave?: () => void; // clic sur mon statut (« Inscrit ✓ »…) : propose de me désinscrire
  onManage?: () => void; // organisateur : ouvre le choix Modifier / Supprimer
}) {
  const t = useT();
  const language = useLanguage();
  const [coverFailed, setCoverFailed] = useState(false);

  const cover = !coverFailed && event.cover_url ? event.cover_url : null;
  const fallback = sportImage(event.sport, sport?.name ?? "");
  const place = [event.venue_name, event.city].filter(Boolean).join(", ");
  const full = event.capacity !== null && goingCount >= event.capacity;
  const count =
    event.capacity !== null
      ? t("event.participantsCap").replace("{n}", String(goingCount)).replace("{max}", String(event.capacity))
      : goingCount === 1
        ? t("event.participants1")
        : t("event.participantsN").replace("{n}", String(goingCount));

  const pill = "relative z-10 flex min-h-10 shrink-0 items-center rounded-full px-4 text-xs font-bold";
  const muted = `${pill} border border-line text-muted`;

  // Inscription (tout le monde, organisateur compris)
  let joinAction: ReactNode = null;
  if (event.cancelled) joinAction = isOrganizer ? null : <span className={muted}>{t("card.cancelled")}</span>;
  else if (ended) joinAction = isOrganizer ? null : <span className={muted}>{t("card.ended")}</span>;
  else if (status) {
    // Mon statut : un bouton qui propose de me désinscrire (ou d'annuler ma demande)
    const label = status === "going" ? t("card.going") : status === "pending" ? t("card.pending") : t("card.waitlist");
    const look = status === "going" ? "border border-accent-ink text-accent-ink hover:bg-accent-ink/10" : "bg-line text-muted hover:text-foreground";
    joinAction = onLeave ? (
      <button
        type="button"
        onClick={onLeave}
        disabled={busy}
        aria-haspopup="dialog"
        aria-label={`${label} — ${t("card.leaveLabel").replace("{title}", event.title)}`}
        className={`${pill} ${look} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60`}
      >
        {label}
      </button>
    ) : (
      <span className={`${pill} ${look}`}>{label}</span>
    );
  }
  else if (tooYoung)
    joinAction = (
      <span aria-disabled="true" className={muted}>
        {event.min_age >= 18 ? t("eventForm.age18") : t("eventForm.age16")}
      </span>
    );
  else if (full && (event.join_mode === "open" || isOrganizer))
    joinAction = (
      <span aria-disabled="true" className={muted}>
        {t("card.full")}
      </span>
    );
  else
    joinAction = (
      <button
        type="button"
        onClick={onJoin}
        disabled={busy || !onJoin}
        aria-label={t("card.joinLabel").replace("{title}", event.title)}
        className={`${pill} bg-accent text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60`}
      >
        {/* L'organisateur n'a pas à demander la permission à lui-même */}
        {event.join_mode === "approval" && !isOrganizer ? t("card.request") : t("card.join")}
      </button>
    );

  // Gérer (organisateur seulement)
  const manageAction: ReactNode = !isOrganizer ? null : onManage ? (
    <button
      type="button"
      onClick={onManage}
      aria-haspopup="dialog"
      aria-label={t("card.manageLabel").replace("{title}", event.title)}
      className={`${pill} border border-accent-ink text-accent-ink transition-colors hover:bg-accent-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink`}
    >
      {t("card.manage")}
    </button>
  ) : (
    <span className={`${pill} border border-accent-ink text-accent-ink`}>{t("card.manage")}</span>
  );

  return (
    <article className="relative flex gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors focus-within:border-accent-ink hover:border-accent-ink">
      {/* Vignette 140 × 120 : couverture, sinon photo du sport, sinon dégradé avec l'émoji */}
      <div className="relative h-[120px] w-[140px] shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#020702,#0b3d12)]">
        {cover ? (
          <Image src={cover} alt="" fill sizes="140px" unoptimized onError={() => setCoverFailed(true)} className="object-cover" />
        ) : fallback ? (
          <Image src={fallback} alt="" fill sizes="140px" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-5xl">
            {sport?.emoji ?? "🏅"}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-base font-bold">
          {/* Lien étiré : toute la carte est cliquable, le bouton reste au-dessus */}
          <Link href={`/evenements/${event.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl">
            {event.title}
          </Link>
        </h3>
        <ul className="mt-1.5 flex flex-col gap-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <svg {...iconProps} className={metaIcon}>
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="truncate">{place}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg {...iconProps} className={metaIcon}>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
            </svg>
            <span className="truncate">{formatEventDate(event.starts_at, language)}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg {...iconProps} className={metaIcon}>
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
            </svg>
            <span className="truncate">{count}</span>
          </li>
        </ul>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
          {joinAction}
          {manageAction}
        </div>
      </div>
    </article>
  );
}

// Squelette d'une carte pendant le chargement
export function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="h-[120px] w-[140px] shrink-0 animate-pulse rounded-xl bg-line" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-line" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-line" />
        <div className="mt-auto h-9 w-24 self-end animate-pulse rounded-full bg-line" />
      </div>
    </div>
  );
}
