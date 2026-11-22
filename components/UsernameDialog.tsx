"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import UsernameField from "./UsernameField";
import { useT } from "../lib/i18n";
import { isValidUsername } from "../lib/profile";

// Fenêtre « Nom d'utilisateur » avec ses boutons Annuler / Enregistrer (ou Valider).
// onConfirm renvoie un message d'erreur à afficher, ou null si c'est bon (la fenêtre se ferme).
export default function UsernameDialog({
  open,
  value,
  confirmLabel,
  onConfirm,
  onClose,
  initialError,
}: {
  open: boolean;
  value: string;
  initialError?: string; // message affiché dès l'ouverture (ex. nom déjà pris)
  confirmLabel: string;
  onConfirm: (username: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Ouvre ou ferme la fenêtre ; à chaque ouverture on repart du nom actuel
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(value);
      setError(initialError ?? "");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, value, initialError]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Le formulaire de la fenêtre ne doit pas envoyer celui de la page
    e.stopPropagation();
    if (!isValidUsername(draft)) {
      setError(t("profile.errorUsername"));
      return;
    }
    setBusy(true);
    const message = await onConfirm(draft);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  // Affichée dans le body : un formulaire ne peut pas se trouver dans le formulaire de la page
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="username-dialog-title"
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70"
    >
      <form onSubmit={handleSubmit}>
        <h2 id="username-dialog-title" className="mb-5 text-xl font-black italic tracking-tight">
          {t("profile.editUsername")}
        </h2>

        <UsernameField
          value={draft}
          onChange={(username) => {
            setDraft(username);
            setError("");
          }}
        />

        {error && (
          <p aria-live="polite" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-2xl border border-line py-3 text-sm font-bold disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-2xl bg-accent py-3 text-sm font-bold text-on-accent disabled:opacity-60"
          >
            {busy ? t("common.saving") : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>,
    document.body
  );
}
