"use client";

import { useLanguage, useT } from "../lib/i18n";
import { AVAILABLE_LANGUAGES, setLanguage, type Language } from "../lib/language";

const names: Record<Language, string> = { fr: "Français", en: "English" };

// Petit bouton FR | EN pour changer de langue avant d'avoir un compte.
// tone="dark" : pour l'écran avec le stade, qui reste toujours sombre.
export default function LanguageToggle({ tone = "theme" }: { tone?: "theme" | "dark" }) {
  const t = useT();
  const current = useLanguage();

  const box =
    tone === "dark" ? "border-white/30 bg-black/50 backdrop-blur-sm" : "border-line bg-surface";
  const idle = tone === "dark" ? "text-neutral-300" : "text-muted";

  return (
    <div role="group" aria-label={t("prefs.language")} className={`flex rounded-full border p-0.5 ${box}`}>
      {AVAILABLE_LANGUAGES.map((language) => {
        const selected = language === current;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-label={names[language]}
            aria-pressed={selected}
            onClick={() => setLanguage(language)}
            className={`min-w-10 rounded-full px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
              selected ? "bg-accent text-on-accent" : idle
            }`}
          >
            {language}
          </button>
        );
      })}
    </div>
  );
}
