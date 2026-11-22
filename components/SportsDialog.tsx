"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage, useT } from "../lib/i18n";
import { MAX_SPORTS, POPULAR_SPORT_IDS, getSport, searchSports, sportName, type Sport } from "../lib/sports";

// Fenêtre « Tes sports » : barre de recherche, sports choisis (retirables) et suggestions.
// onConfirm renvoie un message d'erreur à afficher, ou null si c'est bon (la fenêtre se ferme).
export default function SportsDialog({
  open,
  value,
  onConfirm,
  onClose,
}: {
  open: boolean;
  value: string[];
  onConfirm: (sportIds: string[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>(value);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // À chaque ouverture on repart des sports enregistrés, recherche vide
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setSelected(value);
      setQuery("");
      setError("");
      dialog.showModal();
      searchRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, value]);

  function toggle(id: string) {
    setError("");
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
    } else if (selected.length >= MAX_SPORTS) {
      setError(t("sports.max"));
    } else {
      setSelected([...selected, id]);
    }
  }

  async function confirm() {
    setBusy(true);
    const message = await onConfirm(selected);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  const searching = query.trim() !== "";
  const results: Sport[] = searching
    ? searchSports(query, language)
    : POPULAR_SPORT_IDS.filter((id) => !selected.includes(id))
        .map(getSport)
        .filter((sport) => sport !== undefined);
  const chosen = selected.map(getSport).filter((sport) => sport !== undefined);

  // Affichée dans le body : elle ne doit pas se trouver dans le formulaire de la page
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="sports-dialog-title"
      onClose={onClose}
      className="m-auto flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md flex-col rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70 [&:not([open])]:hidden"
    >
      <h2 id="sports-dialog-title" className="text-xl font-black italic tracking-tight">
        {t("sports.title")}
      </h2>

      {/* Barre de recherche */}
      <div className="relative mt-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("sports.searchPlaceholder")}
          aria-label={t("sports.searchLabel")}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-full border border-accent-ink/40 bg-surface py-3 pl-12 pr-4 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
        />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {/* Sports choisis : on les retire d'un clic */}
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
          {t("sports.yours")} ({chosen.length}/{MAX_SPORTS})
        </h3>
        {chosen.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("sports.none")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {chosen.map((sport) => (
              <li key={sport.id}>
                <button
                  type="button"
                  onClick={() => toggle(sport.id)}
                  aria-label={`${t("sports.remove")} ${sportName(sport, language)}`}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-on-accent"
                >
                  <span aria-hidden="true">{sport.emoji}</span>
                  {sportName(sport, language)}
                  <span aria-hidden="true" className="ml-0.5 text-base leading-none">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Suggestions (recherche vide) ou résultats de la recherche */}
        <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">
          {searching ? t("sports.results") : t("sports.suggestions")}
        </h3>
        {searching && results.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {t("sports.noResult").replace("{q}", query.trim())}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {results.map((sport) => {
              const isSelected = selected.includes(sport.id);
              return (
                <li key={sport.id}>
                  <button
                    type="button"
                    onClick={() => toggle(sport.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      isSelected ? "border-accent-ink bg-accent-ink/10" : "border-line bg-surface hover:border-accent-ink"
                    }`}
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      {sport.emoji}
                    </span>
                    <span className="flex-1">{sportName(sport, language)}</span>
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-black ${
                        isSelected ? "border-accent-ink bg-accent-ink text-background" : "border-line text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p aria-live="polite" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 rounded-2xl border border-line py-3 text-sm font-bold disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="flex-1 rounded-2xl bg-accent py-3 text-sm font-bold text-on-accent disabled:opacity-60"
        >
          {busy ? t("common.saving") : t("settings.save")}
        </button>
      </div>
    </dialog>,
    document.body
  );
}
