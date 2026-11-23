"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useT } from "../lib/i18n";

export type ComboboxOption = { id: string; label: string };

// Champ de recherche avec liste de suggestions (motif ARIA « combobox » avec liste).
// Le parent garde le texte tapé, les options et la valeur choisie ; une fois une valeur choisie,
// elle s'affiche avec un bouton « Changer » qui rouvre la recherche.
// status : "idle" (rien à chercher encore), "loading" (recherche en cours), "ready" (résultats à jour).
export default function Combobox({
  id,
  label,
  placeholder,
  inputValue,
  onInputChange,
  options,
  selected,
  onSelect,
  onClear,
  status = "ready",
  emptyMessage,
  idleHint,
  disabled = false,
  disabledHint,
  inputRef,
}: {
  id: string;
  label: string;
  placeholder?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  options: ComboboxOption[];
  selected: ComboboxOption | null;
  onSelect: (option: ComboboxOption) => void;
  onClear: () => void;
  status?: "idle" | "loading" | "ready";
  emptyMessage?: string;
  idleHint?: string; // affiché sous le champ tant que status vaut "idle" (ex. « Tape au moins 2 lettres. »)
  disabled?: boolean;
  disabledHint?: string; // affiché sous le champ quand il est désactivé
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  const [open, setOpen] = useState(false);
  // On retient l'option active par son identifiant : si la liste change, elle n'est plus active d'elle-même
  const [activeId, setActiveId] = useState<string | null>(null);
  const focusAfterClear = useRef(false);

  const labelId = `${id}-label`;
  const listId = `${id}-listbox`;
  const hintId = `${id}-hint`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const activeIndex = options.findIndex((o) => o.id === activeId);
  const showList = open && !disabled && status === "ready" && options.length > 0;
  const showEmpty = open && !disabled && status === "ready" && options.length === 0;

  // Après « Changer », le champ réapparaît : on y place le focus
  useEffect(() => {
    if (!selected && focusAfterClear.current) {
      focusAfterClear.current = false;
      input.current?.focus();
    }
  }, [selected, input]);

  // L'option active reste visible quand on la parcourt au clavier
  useEffect(() => {
    if (!showList || activeIndex < 0) return;
    document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [showList, activeIndex, id]);

  function choose(option: ComboboxOption) {
    setOpen(false);
    setActiveId(null);
    onSelect(option);
  }

  function move(step: 1 | -1) {
    if (!open) setOpen(true);
    if (options.length === 0) return;
    const next = activeIndex < 0 ? (step === 1 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length;
    setActiveId(options[next].id);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Enter":
        // Entrée choisit l'option active ; sans option active, on n'envoie pas le formulaire par erreur
        if (showList && activeIndex >= 0) {
          e.preventDefault();
          choose(options[activeIndex]);
        } else if (open) {
          e.preventDefault();
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActiveId(null);
        }
        break;
      case "Tab":
        // Tab passe au champ suivant (comportement normal) et ferme la liste
        setOpen(false);
        break;
    }
  }

  // Annonce pour les lecteurs d'écran : nombre de résultats ou « Aucun résultat. »
  let announcement = "";
  if (showEmpty) announcement = emptyMessage ?? t("combobox.noResult");
  else if (showList)
    announcement =
      options.length === 1 ? t("combobox.oneResult") : t("combobox.results").replace("{n}", String(options.length));
  else if (open && status === "loading") announcement = t("combobox.searching");

  const hint = disabled ? disabledHint : status === "idle" && !selected ? idleHint : undefined;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Le focus quitte le composant : on ferme la liste
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label id={labelId} htmlFor={selected ? undefined : `${id}-input`} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>

      {selected ? (
        <div
          role="group"
          aria-labelledby={labelId}
          className={`flex min-h-12 items-center gap-3 rounded-xl border-2 border-accent-ink bg-surface py-1.5 pl-4 pr-1.5 ${
            disabled ? "opacity-60" : ""
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{selected.label}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              focusAfterClear.current = true;
              setOpen(true);
              setActiveId(null);
              onClear();
            }}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed"
          >
            {t("combobox.change")}
            <span className="sr-only"> : {label}</span>
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={input}
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={hint ? hintId : undefined}
            aria-busy={status === "loading"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={placeholder}
            disabled={disabled}
            value={inputValue}
            onChange={(e) => {
              setOpen(true);
              setActiveId(null);
              onInputChange(e.target.value);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="min-h-12 w-full rounded-xl border border-accent-ink/40 bg-surface py-3 pl-11 pr-10 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink disabled:cursor-not-allowed disabled:opacity-60"
          />
          {/* Loupe */}
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {status === "loading" && (
            <span aria-hidden="true" className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          )}
        </div>
      )}

      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}

      {/* La liste existe toujours (aria-controls doit pointer vers un élément) ; elle n'est visible qu'ouverte */}
      <ul
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        hidden={!showList}
        // Empêche le champ de perdre le focus quand on touche ou clique une option
        onMouseDown={(e) => e.preventDefault()}
        className="absolute inset-x-0 z-20 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl border-2 border-line bg-surface py-1 shadow-lg shadow-black/30"
      >
        {options.map((option, index) => {
          const active = index === activeIndex;
          return (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={active}
              onClick={() => choose(option)}
              onMouseMove={() => {
                if (!active) setActiveId(option.id);
              }}
              className={`flex min-h-11 cursor-pointer items-center px-4 py-2.5 text-base ${
                active ? "bg-accent-ink/15 font-semibold text-accent-ink" : "text-foreground"
              }`}
            >
              {option.label}
            </li>
          );
        })}
      </ul>

      {showEmpty && (
        <p className="absolute inset-x-0 z-20 mt-1.5 rounded-xl border-2 border-line bg-surface px-4 py-3 text-sm text-muted">
          {emptyMessage ?? t("combobox.noResult")}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
