"use client";

import Link from "next/link";
import { useT } from "../lib/i18n";

// Bandeau affiché quand une inscription est refusée faute de date de naissance (erreur date_naissance_manquante),
// avec un lien vers Paramètres → Compte pour la remplir. Placé au-dessus de la barre du bas.
export default function BirthDateNotice({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="flex w-full max-w-[468px] items-start gap-3 rounded-2xl border border-accent-ink bg-surface p-3 shadow-lg">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{t("event.errorBirthDate")}</p>
          <Link href="/parametres/compte" className="mt-1 inline-flex min-h-11 items-center font-bold text-accent-ink underline">
            {t("birth.addLink")}
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
