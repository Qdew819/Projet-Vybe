"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT, type MessageKey } from "../lib/i18n";
import { useMounted } from "../lib/useMounted";
import { LEVEL_LABEL, SPORT_LEVELS, type SportLevel, type UserSport } from "../lib/userSports";

// Fenêtre ouverte en touchant un de mes sports : changer le niveau ou retirer le sport.
// À afficher seulement quand un sport est choisi (elle s'ouvre dès qu'elle apparaît).
// onSave et onRemove renvoient la clé du message d'erreur, ou null si c'est enregistré (la fenêtre se ferme).
export default function SportEditDialog({
  sport,
  onSave,
  onRemove,
  onClose,
}: {
  sport: UserSport;
  onSave: (level: SportLevel) => Promise<MessageKey | null>;
  onRemove: () => Promise<MessageKey | null>;
  onClose: () => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [level, setLevel] = useState<SportLevel>(sport.level);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // Focus sur le niveau actuel
      dialog.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
    }
  }, [mounted]);

  // close() déclenche onClose et rend le focus à la pastille qui a ouvert la fenêtre
  function close() {
    dialogRef.current?.close();
  }

  async function run(kind: "save" | "remove") {
    setBusy(kind);
    setError(null);
    const message = kind === "save" ? await onSave(level) : await onRemove();
    setBusy(null);
    if (message) {
      setError(message);
      return;
    }
    close();
  }

  const name = sport.sport.name;
  const group = `niveau-fenetre-${sport.sport.id}`;

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="sport-edit-title"
      aria-describedby="sport-edit-hint"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70"
    >
      <h2 id="sport-edit-title" className="flex items-center gap-2 text-xl font-black italic tracking-tight">
        <span aria-hidden="true" className="not-italic">
          {sport.sport.emoji}
        </span>
        {name}
      </h2>
      <p id="sport-edit-hint" className="mt-1 text-sm text-muted">
        {t("sports.editHint")}
      </p>

      <fieldset className="mt-5" disabled={busy !== null}>
        <legend className="mb-2 text-sm font-semibold">{t("sports.levelGroup").replace("{name}", name)}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {SPORT_LEVELS.map((option) => (
            <label key={option} className="relative">
              <input
                type="radio"
                name={group}
                value={option}
                checked={level === option}
                onChange={() => {
                  setLevel(option);
                  setError(null);
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-xs font-bold text-muted transition-colors hover:text-foreground peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink peer-disabled:cursor-not-allowed">
                {t(LEVEL_LABEL[option])}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-danger">
        {error ? t(error) : ""}
      </p>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={close}
          disabled={busy !== null}
          className="flex-1 rounded-2xl border border-line py-3 text-sm font-bold disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => run("save")}
          disabled={busy !== null || level === sport.level}
          aria-busy={busy === "save"}
          className="flex-1 rounded-2xl bg-accent py-3 text-sm font-bold text-on-accent disabled:opacity-60"
        >
          {busy === "save" ? t("common.saving") : t("settings.save")}
        </button>
      </div>

      <button
        type="button"
        onClick={() => run("remove")}
        disabled={busy !== null}
        aria-busy={busy === "remove"}
        className="mt-3 w-full rounded-2xl border-2 border-danger py-3 text-sm font-bold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60"
      >
        {busy === "remove" ? t("common.wait") : t("sports.removeSport")}
      </button>
    </dialog>,
    document.body
  );
}
