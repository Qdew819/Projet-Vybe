"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCloseDialogOnHide } from "../lib/useCloseDialogOnHide";
import { createPortal } from "react-dom";
import { useT, type MessageKey } from "../lib/i18n";
import { useMounted } from "../lib/useMounted";

// Raisons acceptées par la base (colonne reports.reason)
export const REPORT_REASONS = ["spam", "harcelement", "faux_compte", "contenu_inapproprie", "mineur_en_danger", "autre"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_DETAILS_MAX = 500;

const REASON_LABELS: Record<ReportReason, MessageKey> = {
  spam: "report.spam",
  harcelement: "report.harassment",
  faux_compte: "report.fakeAccount",
  contenu_inapproprie: "report.inappropriate",
  mineur_en_danger: "report.minor",
  autre: "report.other",
};

// Fenêtre « Signaler » : raison (boutons radio), détails facultatifs, puis message de remerciement
// avec, si onBlock est fourni, un bouton « Bloquer cette personne ».
// onSubmit renvoie un message d'erreur à afficher, ou null si le signalement est envoyé.
export default function ReportDialog({
  open,
  username,
  onSubmit,
  onBlock,
  onClose,
}: {
  open: boolean;
  username: string;
  onSubmit: (reason: ReportReason, details: string) => Promise<string | null>;
  onBlock?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // À chaque ouverture, formulaire vide
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason(null);
      setDetails("");
      setError("");
      setSent(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, mounted]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Le formulaire de la fenêtre ne doit pas envoyer celui de la page
    e.stopPropagation();
    if (!reason) {
      setError(t("report.chooseReason"));
      return;
    }
    setBusy(true);
    setError("");
    const message = await onSubmit(reason, details.trim());
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setSent(true);
  }

  // Rien au premier rendu (comme le serveur) : le portail apparaît juste après l'hydratation
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="report-dialog-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70"
    >
      <h2 id="report-dialog-title" className="text-xl font-black italic tracking-tight">
        {t("report.title").replace("{name}", username)}
      </h2>

      {sent ? (
        <div className="mt-4 flex flex-col gap-4">
          <p aria-live="polite" className="text-base text-accent-ink">
            {t("report.thanks")}
          </p>
          {onBlock && (
            <button
              type="button"
              onClick={onBlock}
              className="w-full rounded-2xl border-2 border-danger py-3 text-sm font-bold text-danger hover:bg-danger/10"
            >
              {t("report.blockToo")}
            </button>
          )}
          <button type="button" onClick={onClose} className="w-full rounded-2xl border border-line py-3 text-sm font-bold">
            {t("avatarPicker.close")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">{t("report.why")}</legend>
            <div className="flex flex-col gap-2">
              {REPORT_REASONS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
                    reason === value ? "border-accent-ink" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => {
                      setReason(value);
                      setError("");
                    }}
                    className="h-5 w-5 shrink-0 accent-accent-ink"
                  />
                  {t(REASON_LABELS[value])}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="report-details" className="mb-1.5 block text-sm font-semibold">
              {t("report.details")}
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={REPORT_DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              aria-describedby="report-details-count"
              placeholder={t("report.detailsPlaceholder")}
              className="w-full resize-none rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
            />
            <p id="report-details-count" className="mt-1.5 text-right text-xs text-muted">
              {details.length}/{REPORT_DETAILS_MAX}
            </p>
          </div>

          <p aria-live="polite" className="text-sm text-danger">
            {error}
          </p>

          <div className="flex gap-3">
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
              disabled={busy || !reason}
              aria-busy={busy}
              className="flex-1 rounded-2xl bg-accent py-3 text-sm font-bold text-on-accent disabled:opacity-60"
            >
              {busy ? t("common.wait") : t("report.send")}
            </button>
          </div>
        </form>
      )}
    </dialog>,
    document.body
  );
}
