"use client";

import { translate, useT } from "../lib/i18n";
import { isLanguageAvailable, type Language } from "../lib/language";

// Chaque langue s'affiche dans sa propre langue, pour qu'on la reconnaisse
const options: { value: Language; label: string; code: string }[] = [
  { value: "fr", label: "Français", code: "FR" },
  { value: "en", label: "English", code: "EN" },
];

export default function LanguagePicker({
  value,
  onChange,
}: {
  value: Language;
  onChange: (language: Language) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("prefs.language")} className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const available = isLanguageAvailable(o.value);
        const selected = available && o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            lang={o.value}
            aria-checked={selected}
            aria-disabled={!available}
            disabled={!available}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-surface p-2.5 pb-3 text-center transition-colors disabled:cursor-not-allowed ${
              selected ? "border-accent-ink" : "border-line"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-12 w-full items-center justify-center rounded-lg border border-line text-lg font-black italic tracking-tight ${
                selected ? "text-accent-ink" : "text-subtle"
              }`}
            >
              {o.code}
            </span>
            <span className={`text-sm font-bold ${selected ? "text-accent-ink" : available ? "" : "text-muted"}`}>
              {o.label}
            </span>
            {available ? (
              <span className="text-[11px] leading-tight text-muted">{translate(o.value, "prefs.languageHint")}</span>
            ) : (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold leading-tight text-muted">
                {translate(o.value, "prefs.soon")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
