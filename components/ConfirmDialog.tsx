"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";

// Fenêtre de confirmation. Fenêtre modale native : le focus reste dedans, Échap la ferme,
// et elle est annoncée comme une fenêtre de dialogue. Le focus part sur « Annuler » (choix sans risque).
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  danger = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean; // bouton de confirmation rouge (action destructive)
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Affichée dans le body : elle peut être utilisée même à l'intérieur d'un formulaire
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-description" : undefined}
      onCancel={(e) => {
        // Échap : on ne ferme pas pendant que l'action est en cours
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70"
    >
      <h2 id="confirm-dialog-title" className="text-lg font-bold">
        {title}
      </h2>
      {description && (
        <p id="confirm-dialog-description" className="mt-2 text-sm text-muted">
          {description}
        </p>
      )}
      {error && (
        <p aria-live="polite" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 rounded-2xl border border-line py-3 text-sm font-bold disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
          className={`flex-1 rounded-2xl py-3 text-sm font-bold disabled:opacity-60 ${
            danger ? "bg-danger text-background" : "bg-accent text-on-accent"
          }`}
        >
          {busy ? t("common.wait") : confirmLabel}
        </button>
      </div>
    </dialog>,
    document.body
  );
}
