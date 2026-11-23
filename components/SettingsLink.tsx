import type { ReactNode } from "react";
import Link from "next/link";

// Ligne cliquable des paramètres : icône, titre, sous-titre, pastille facultative et flèche ›
export default function SettingsLink({
  href,
  icon,
  title,
  hint,
  badge,
  badgeLabel,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  hint: string;
  badge?: number; // affichée seulement si > 0
  badgeLabel?: string; // texte lu par les lecteurs d'écran pour la pastille
}) {
  const showBadge = badge !== undefined && badge > 0;
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <span aria-hidden="true" className="shrink-0 text-accent-ink">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs leading-snug text-muted">{hint}</span>
      </span>
      {showBadge && (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-xs font-black text-on-accent">
          <span aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
          {badgeLabel && <span className="sr-only">{badgeLabel}</span>}
        </span>
      )}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}
