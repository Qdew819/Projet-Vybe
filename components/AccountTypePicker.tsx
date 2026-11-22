"use client";

import { useT, type MessageKey } from "../lib/i18n";

export type AccountType = "public" | "private";

const options: { value: AccountType; label: MessageKey; hint: MessageKey }[] = [
  { value: "public", label: "profile.public", hint: "profile.publicHint" },
  { value: "private", label: "profile.private", hint: "profile.privateHint" },
];

// Choix « Public » ou « Privé » : vrais boutons radio (flèches du clavier), affichés en cartes
export default function AccountTypePicker({
  value,
  onChange,
  note,
}: {
  value: AccountType;
  onChange: (choice: AccountType) => void;
  note?: string;
}) {
  const t = useT();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.accountType")}</legend>
      <p className="mb-3 text-sm font-semibold">{t("profile.accountQuestion")}</p>
      <div className="flex flex-col gap-3">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
                selected ? "border-accent-ink" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink"
              />
              <span className="flex flex-col gap-1">
                <span className={`text-sm font-bold ${selected ? "text-accent-ink" : ""}`}>{t(o.label)}</span>
                <span className="text-xs leading-snug text-muted">{t(o.hint)}</span>
              </span>
            </label>
          );
        })}
      </div>
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </fieldset>
  );
}
