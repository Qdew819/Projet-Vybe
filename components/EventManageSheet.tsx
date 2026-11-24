"use client";

import { useEffect, useRef } from "react";
import { useCloseDialogOnHide } from "../lib/useCloseDialogOnHide";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT } from "../lib/i18n";
import { useMounted } from "../lib/useMounted";

// Feuille « Gérer » d'une carte d'événement (organisateur) : Modifier ou Supprimer.
// Même fonctionnement que CreateSheet : fenêtre modale native, Échap ou clic sur le fond la ferme,
// et le focus revient sur le bouton « Gérer » qui l'a ouverte.
export default function EventManageSheet({
  eventId,
  title,
  onDelete,
  onClose,
}: {
  eventId: string | null; // null : feuille fermée
  title: string;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = eventId !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      firstRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="manage-sheet-title"
      onClose={() => {
        onClose();
        openerRef.current?.focus();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-[500px] rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <h2 id="manage-sheet-title" className="mt-3 text-lg font-bold">
          {t("card.manageTitle")}
        </h2>
        <p className="truncate text-sm text-muted">{title}</p>

        <ul className="mt-4 flex flex-col gap-3">
          <li>
            <Link
              ref={firstRef}
              href={eventId ? `/evenements/${eventId}?modifier=1` : "/evenements"}
              onClick={() => dialogRef.current?.close()}
              className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("event.edit")}</span>
                <span className="block text-sm text-muted">{t("card.editHint")}</span>
              </span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                onDelete();
              }}
              className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:border-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            >
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-danger text-danger">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-danger">{t("event.delete")}</span>
                <span className="block text-sm text-muted">{t("card.deleteHint")}</span>
              </span>
            </button>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="mt-4 min-h-12 w-full rounded-2xl text-sm font-bold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {t("common.cancel")}
        </button>
      </div>
    </dialog>,
    document.body
  );
}
