"use client";

import { useState, useSyncExternalStore } from "react";
import { useT } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";
import { getSavedTheme, setTheme, type ThemeChoice } from "../lib/theme";

// Suit les changements faits dans un autre onglet
function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Ligne « Éclairage » des paramètres : bascule entre sombre et clair.
// Le changement s'applique tout de suite et s'enregistre dans le profil
// (sinon /accueil remettrait l'ancien thème).
export default function LightingToggle() {
  const t = useT();
  // Choix sauvegardé sur l'appareil (inconnu pendant le rendu serveur)
  const saved = useSyncExternalStore(subscribeStorage, getSavedTheme, () => null);
  const [picked, setCurrent] = useState<ThemeChoice | null>(null);
  const current = picked ?? saved;
  const [error, setError] = useState("");

  async function choose(choice: "dark" | "light") {
    if (choice === current) return;
    const previous = current;
    setError("");
    setCurrent(choice);
    setTheme(choice);

    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    // On garde les autres infos du profil (prénom, langue…)
    const { error } = await supabase.auth.updateUser({
      data: { ...(data.user?.user_metadata ?? {}), theme: choice },
    });
    if (error) {
      console.error(`Enregistrement du thème impossible : ${error.message}`);
      if (previous) {
        setCurrent(previous);
        setTheme(previous);
      }
      setError(t("settings.lightingError"));
    }
  }

  const options = [
    { value: "dark", label: t("theme.dark") },
    { value: "light", label: t("theme.light") },
  ] as const;

  return (
    <div className="rounded-2xl border-2 border-line bg-surface p-4">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="shrink-0 text-accent-ink">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id="titre-eclairage" className="text-sm font-bold">
            {t("settings.lighting")}
          </span>
          <span className="text-xs leading-snug text-muted">
            {current === "auto" ? t("settings.lightingAutoHint") : t("settings.lightingHint")}
          </span>
        </span>
      </div>

      <div role="radiogroup" aria-labelledby="titre-eclairage" className="mt-3 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const selected = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(o.value)}
              className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
                selected ? "border-accent bg-accent text-on-accent" : "border-line text-foreground hover:border-accent-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p aria-live="polite" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
