"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { useT } from "../lib/i18n";
import { personName, type Person } from "../lib/follows";
import { initialsOf } from "../lib/profile";

// Ligne de personne : photo ronde de 48 px (initiales sinon), nom, @, cadenas si le compte est privé,
// sous-titre facultatif (ex. « il y a 5 min ») et boutons à droite.
// La photo et le nom mènent au profil public /u/<username>.
export default function PersonRow({
  person,
  subtitle,
  actions,
}: {
  person: Person;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const t = useT();
  const handle = person.username ? `@${person.username}` : t("privacy.unknownUser");
  const name = personName(person, handle);

  const identity = (
    <>
      <Avatar src={person.avatarUrl} initial={initialsOf(name)} alt="" size={48} />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-bold">{name}</span>
          {person.isPrivate && (
            <>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span className="sr-only">{t("people.privateAccount")}</span>
            </>
          )}
        </span>
        <span className="truncate text-xs text-muted">{handle}</span>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      {person.username ? (
        <Link
          href={`/u/${person.username}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {identity}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{identity}</span>
      )}
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </li>
  );
}

// Petit bouton d'action d'une ligne (Accepter, Refuser, Débloquer…)
export function RowButton({
  label,
  ariaLabel,
  busy,
  disabled,
  variant,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  busy: boolean;
  disabled?: boolean;
  variant: "primary" | "secondary";
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      aria-label={ariaLabel}
      className={`rounded-xl px-3 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60 ${
        variant === "primary" ? "bg-accent text-on-accent" : "border-2 border-line text-foreground hover:border-accent-ink"
      }`}
    >
      {busy ? t("common.wait") : label}
    </button>
  );
}
