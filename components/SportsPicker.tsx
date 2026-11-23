"use client";

import { useId, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { normalizeSearch } from "../lib/sports";
import {
  DEFAULT_LEVEL,
  LEVEL_LABEL,
  MAX_SPORTS,
  SPORT_LEVELS,
  useSportsCatalog,
  type CatalogSport,
  type SportChoice,
  type SportLevel,
} from "../lib/userSports";

// Choix des sports et du niveau : recherche, pastilles sélectionnables (sports choisis en premier),
// puis une ligne par sport choisi avec son niveau et un bouton pour le retirer.
export default function SportsPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: SportChoice[];
  onChange: (value: SportChoice[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const uid = useId();
  const { state, retry } = useSportsCatalog();
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pillRefs = useRef(new Map<number, HTMLButtonElement>());

  if (state.status === "loading") {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-sm text-danger">{t("sports.catalogError")}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-2xl border-2 border-accent-ink px-5 py-2 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {t("sports.retry")}
        </button>
      </div>
    );
  }

  const catalog = state.sports;
  const byId = new Map(catalog.map((sport) => [sport.id, sport]));
  const chosen = value.flatMap((choice) => {
    const sport = byId.get(choice.sportId);
    return sport ? [{ sport, level: choice.level }] : [];
  });
  const chosenIds = new Set(value.map((choice) => choice.sportId));
  const full = value.length >= MAX_SPORTS;

  // Sports choisis d'abord (dans l'ordre d'ajout), puis le reste du catalogue
  const q = normalizeSearch(query);
  const ordered: CatalogSport[] = [
    ...chosen.map((entry) => entry.sport),
    ...catalog.filter((sport) => !chosenIds.has(sport.id)),
  ];
  const visible = q ? ordered.filter((sport) => sport.search.includes(q)) : ordered;

  function counts(n: number) {
    return { n: String(n), max: String(MAX_SPORTS) };
  }
  function fill(text: string, values: Record<string, string>) {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  }

  function add(sport: CatalogSport) {
    if (disabled || chosenIds.has(sport.id)) return;
    if (full) {
      setAnnouncement(t("sports.maxReached"));
      return;
    }
    const next = [...value, { sportId: sport.id, level: DEFAULT_LEVEL }];
    onChange(next);
    const text = fill(t("sports.added"), { name: sport.name, ...counts(next.length) });
    setAnnouncement(next.length >= MAX_SPORTS ? `${text} ${t("sports.maxReached")}` : text);
  }

  // fromRow : retiré depuis la ligne du niveau, qui disparaît ; on remet le focus sur la pastille du sport
  function remove(sport: CatalogSport, fromRow: boolean) {
    if (disabled) return;
    const next = value.filter((choice) => choice.sportId !== sport.id);
    onChange(next);
    setAnnouncement(fill(t("sports.removed"), { name: sport.name, ...counts(next.length) }));
    if (fromRow) {
      requestAnimationFrame(() => (pillRefs.current.get(sport.id) ?? searchRef.current)?.focus());
    }
  }

  function setLevel(sportId: number, level: SportLevel) {
    if (disabled) return;
    onChange(value.map((choice) => (choice.sportId === sportId ? { ...choice, level } : choice)));
  }

  const searchId = `${uid}-recherche`;
  const maxId = `${uid}-max`;

  return (
    <div className="flex flex-col gap-6">
      {/* Annonces pour les lecteurs d'écran à chaque ajout ou retrait */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <div>
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={searchId} className="text-sm font-semibold">
            {t("sports.searchLabel")}
          </label>
          <span
            aria-label={fill(t("sports.counterLabel"), counts(value.length))}
            className={`rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums ${
              full ? "bg-accent text-on-accent" : "border border-line text-muted"
            }`}
          >
            {value.length}/{MAX_SPORTS}
          </span>
        </div>
        <div className="relative mt-1.5">
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
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sports.searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-full border border-accent-ink/40 bg-surface py-3 pl-12 pr-4 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
          />
        </div>
      </div>

      {/* Pastilles : tout le catalogue, sports choisis en premier */}
      <section aria-labelledby={`${uid}-catalogue`}>
        <h2 id={`${uid}-catalogue`} className="sr-only">
          {t("sports.catalogTitle")}
        </h2>
        {full && (
          <p id={maxId} className="mb-3 text-sm font-semibold text-accent-ink">
            {t("sports.maxReached")}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-muted">{fill(t("sports.noResult"), { q: query.trim() })}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {visible.map((sport) => {
              const selected = chosenIds.has(sport.id);
              const locked = !selected && full;
              return (
                <li key={sport.id}>
                  <button
                    ref={(el) => {
                      if (el) pillRefs.current.set(sport.id, el);
                      else pillRefs.current.delete(sport.id);
                    }}
                    type="button"
                    aria-pressed={selected}
                    // aria-disabled plutôt que disabled : la pastille reste atteignable au clavier et le message est lu
                    aria-disabled={locked || disabled || undefined}
                    aria-describedby={locked ? maxId : undefined}
                    onClick={() => (selected ? remove(sport, false) : add(sport))}
                    className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                      selected
                        ? "border-accent bg-accent text-on-accent"
                        : locked
                          ? "cursor-not-allowed border-line bg-surface text-subtle opacity-60"
                          : "border-line bg-surface text-foreground hover:border-accent-ink"
                    }`}
                  >
                    <span aria-hidden="true">{sport.emoji}</span>
                    {sport.name}
                    {selected && (
                      <span aria-hidden="true" className="ml-0.5 text-xs font-black">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Une ligne par sport choisi : niveau (boutons radio) et bouton pour le retirer */}
      <section aria-labelledby={`${uid}-choisis`}>
        <h2 id={`${uid}-choisis`} className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("sports.chosenTitle")}
        </h2>
        {chosen.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">{t("sports.none")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {chosen.map(({ sport, level }) => {
              const group = `${uid}-niveau-${sport.id}`;
              return (
                <li key={sport.id} className="rounded-2xl border-2 border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-xl leading-none">
                      {sport.emoji}
                    </span>
                    <span id={`${group}-nom`} className="min-w-0 flex-1 truncate text-sm font-bold">
                      {sport.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(sport, true)}
                      disabled={disabled}
                      aria-label={fill(t("sports.remove"), { name: sport.name })}
                      title={fill(t("sports.remove"), { name: sport.name })}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <fieldset className="mt-2" disabled={disabled}>
                    <legend className="sr-only">{fill(t("sports.levelGroup"), { name: sport.name })}</legend>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
                      {SPORT_LEVELS.map((option) => (
                        <label key={option} className="relative">
                          <input
                            type="radio"
                            name={group}
                            value={option}
                            checked={level === option}
                            onChange={() => setLevel(sport.id, option)}
                            className="peer sr-only"
                          />
                          <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-xs font-bold text-muted transition-colors hover:text-foreground peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink peer-disabled:cursor-not-allowed">
                            {t(LEVEL_LABEL[option])}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
