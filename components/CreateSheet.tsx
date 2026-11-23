"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT } from "../lib/i18n";
import { useMounted } from "../lib/useMounted";

// La page app/evenements/creer n'existe pas encore : le choix « Créer un événement » est affiché désactivé.
// Passer à true quand la page sera créée.
export const CREATE_EVENT_READY = false;

// Feuille « Créer » qui monte du bas de l'écran (bouton « + » de la barre du bas et raccourci « Publier »).
// Fenêtre modale native : le focus reste dedans, Échap la ferme ; un clic sur le fond la ferme aussi.
// À la fermeture, le focus revient sur le bouton qui l'a ouverte.
export default function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // Premier choix actif s'il y en a un, sinon le bouton Fermer
      const first = dialog.querySelector<HTMLElement>("[data-sheet-option]");
      (first ?? closeRef.current)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="create-sheet-title"
      onClose={() => {
        onClose();
        openerRef.current?.focus();
      }}
      onClick={(e) => {
        // Clic sur le fond (en dehors du contenu) : on ferme
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-[500px] rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <div className="mt-3 flex items-center justify-between">
          <h2 id="create-sheet-title" className="text-lg font-bold">
            {t("create.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          <li>
            <SheetOption
              href={CREATE_EVENT_READY ? "/evenements/creer" : undefined}
              title={t("create.event")}
              hint={t("create.eventHint")}
              soonLabel={t("common.soon")}
              icon={
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5" />
                </svg>
              }
            />
          </li>
          <li>
            <SheetOption
              title={t("create.post")}
              hint={t("create.postHint")}
              soonLabel={t("common.soon")}
              icon={
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="13" height="14" rx="2" />
                  <path d="M16 10l5-3v10l-5-3" />
                </svg>
              }
            />
          </li>
        </ul>
      </div>
    </dialog>,
    document.body
  );
}

// Choix de la feuille : lien s'il a une destination, sinon ligne désactivée avec la pastille « Bientôt »
function SheetOption({
  href,
  title,
  hint,
  icon,
  soonLabel,
}: {
  href?: string;
  title: string;
  hint: string;
  icon: ReactNode;
  soonLabel: string;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${href ? "bg-accent text-on-accent" : "bg-surface text-muted"}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-sheet-option
        className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        {content}
      </Link>
    );
  }
  return (
    <div aria-disabled="true" className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface p-3 opacity-70">
      {content}
      <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-bold text-muted">{soonLabel}</span>
    </div>
  );
}
