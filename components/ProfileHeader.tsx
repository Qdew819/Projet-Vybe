"use client";

import type { ReactNode } from "react";
import { useT } from "../lib/i18n";

// Haut du profil :
// - 1re ligne : photo à gauche, nom en gras et @nom d'utilisateur dessous, bouton « Modifier nom profil » à droite
// - dessous : la bio sur toute la largeur, puis les statistiques (si fournies)
export default function ProfileHeader({
  displayName,
  username,
  onEditUsername,
  avatar,
  stats,
  bio,
}: {
  displayName: string;
  username: string;
  bio?: string; // affichée sous le @nom d'utilisateur
  onEditUsername: () => void;
  avatar: ReactNode;
  stats?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight">{displayName || username}</p>
          <p className="truncate text-sm text-muted">{username ? `@${username}` : t("profile.usernameEmpty")}</p>
        </div>
        <button
          type="button"
          onClick={onEditUsername}
          aria-haspopup="dialog"
          className="flex max-w-30 shrink-0 items-center gap-1.5 rounded-xl border-2 border-accent-ink px-2.5 py-1.5 text-left text-xs font-bold leading-tight text-accent-ink transition-colors hover:bg-accent-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          {t("profile.editUsername")}
        </button>
      </div>

      {/* Bio sous la photo, sur toute la largeur */}
      {bio && <p className="whitespace-pre-line break-words text-sm leading-snug">{bio}</p>}

      {stats}
    </div>
  );
}
