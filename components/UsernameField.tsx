"use client";

import { useT } from "../lib/i18n";
import { USERNAME_MAX, USERNAME_MIN, normalizeUsername } from "../lib/profile";

// Champ « Nom d'utilisateur » avec le @ devant, partagé par la création du profil et les paramètres
export default function UsernameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (username: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">
        {t("profile.username")}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-muted"
        >
          @
        </span>
        <input
          id="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          placeholder={t("profile.usernamePlaceholder")}
          value={value}
          onChange={(e) => onChange(normalizeUsername(e.target.value))}
          aria-describedby="username-hint"
          className="w-full rounded-xl border border-accent-ink/40 bg-surface py-3 pl-9 pr-4 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
        />
      </div>
      <p id="username-hint" className="mt-1.5 text-xs text-muted">
        {t("profile.usernameHint")}
      </p>
    </div>
  );
}
