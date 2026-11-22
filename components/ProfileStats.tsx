"use client";

import type { ReactNode } from "react";
import { useLanguage, useT, type MessageKey } from "../lib/i18n";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  className: "h-3.5 w-3.5 shrink-0 text-accent-ink",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons: Record<"posts" | "followers" | "following", ReactNode> = {
  // Grille de publications
  posts: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  // Deux personnes
  followers: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </svg>
  ),
  // Personne avec un +
  following: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  ),
};

// Statistiques du profil : trois colonnes séparées par une barre (icône verte et chiffre, intitulé dessous)
export default function ProfileStats({
  posts,
  followers,
  following,
}: {
  posts: number;
  followers: number;
  following: number;
}) {
  const t = useT();
  const language = useLanguage();
  // 1 245 en français, 1,245 en anglais
  const format = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA");

  const stats: { key: keyof typeof icons; value: number; label: MessageKey }[] = [
    { key: "posts", value: posts, label: "stats.posts" },
    { key: "followers", value: followers, label: "stats.followers" },
    { key: "following", value: following, label: "stats.following" },
  ];

  return (
    <dl className="grid grid-cols-3 divide-x divide-line">
      {stats.map((stat) => (
        <div key={stat.key} className="flex min-w-0 flex-col-reverse items-center px-2 text-center">
          <dt className="w-full truncate text-xs leading-tight text-muted">{t(stat.label)}</dt>
          <dd className="flex items-center gap-1 text-base font-bold">
            {icons[stat.key]}
            {format.format(stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
