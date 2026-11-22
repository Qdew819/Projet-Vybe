"use client";

import { useT, type MessageKey } from "../lib/i18n";
import type { ThemeChoice } from "../lib/theme";

const options: { value: ThemeChoice; label: MessageKey; hint: MessageKey }[] = [
  { value: "light", label: "theme.light", hint: "theme.lightHint" },
  { value: "dark", label: "theme.dark", hint: "theme.darkHint" },
  { value: "auto", label: "theme.auto", hint: "theme.autoHint" },
];

// Petit aperçu de l'écran dans chaque carte
function Preview({ value }: { value: ThemeChoice }) {
  const screen = (bg: string, line: string) => (
    <div className={`flex h-full flex-1 flex-col gap-1.5 p-2 ${bg}`}>
      <span className={`h-1.5 w-3/4 rounded-full ${line}`} />
      <span className={`h-1.5 w-1/2 rounded-full ${line}`} />
      <span className="mt-auto h-3 w-full rounded-md bg-[#39ff14]" />
    </div>
  );

  return (
    <div aria-hidden="true" className="flex h-20 w-full overflow-hidden rounded-lg border border-line">
      {value === "light" && screen("bg-[#f5f6f3]", "bg-neutral-300")}
      {value === "dark" && screen("bg-black", "bg-neutral-700")}
      {value === "auto" && (
        <>
          {screen("bg-[#f5f6f3]", "bg-neutral-300")}
          {screen("bg-black", "bg-neutral-700")}
        </>
      )}
    </div>
  );
}

export default function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("prefs.display")} className="grid grid-cols-3 gap-3">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-surface p-2.5 pb-3 text-center transition-colors ${
              selected ? "border-accent-ink" : "border-line"
            }`}
          >
            <Preview value={o.value} />
            <span className={`text-sm font-bold ${selected ? "text-accent-ink" : ""}`}>{t(o.label)}</span>
            <span className="text-[11px] leading-tight text-muted">{t(o.hint)}</span>
          </button>
        );
      })}
    </div>
  );
}
