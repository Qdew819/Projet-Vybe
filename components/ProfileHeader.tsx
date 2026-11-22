"use client";

import type { ReactNode } from "react";
import { useT } from "../lib/i18n";

// Ligne du haut du profil : photo à gauche, nom au milieu, « Modifier nom profil » à droite
export default function ProfileHeader({
  displayName,
  username,
  onEditUsername,
  avatar,
}: {
  displayName: string;
  username: string;
  onEditUsername: () => void;
  avatar: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      {avatar}

      {/* Nom affiché en gras, et le @nom d'utilisateur en petit dessous */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold leading-tight">{displayName || (username ? username : "")}</p>
        <p className="truncate text-sm text-muted">
          {username ? `@${username}` : t("profile.usernameEmpty")}
        </p>
      </div>

      <button
        type="button"
        onClick={onEditUsername}
        aria-haspopup="dialog"
        className="flex max-w-30 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-left text-xs font-bold leading-tight transition-colors hover:border-accent-ink focus-visible:border-accent-ink focus-visible:outline-none"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-accent-ink"
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
  );
}
