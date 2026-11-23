"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useT } from "../lib/i18n";
import { COVER_ACCEPT } from "../lib/cover";

const GEAR_PATH =
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";

// Bannière du profil (format 3:1) : photo de fond ou dégradé sombre avec une touche de vert néon.
// En haut : « Retour » à gauche et (si settingsHref) l'icône de réglages à droite, sur fond semi-transparent.
// En bas à droite (si onPick) : bouton rond appareil photo pour changer la photo de fond.
// Sans onPick ni settingsHref, la bannière est en lecture seule (profil d'une autre personne).
export default function ProfileBanner({
  src,
  busy = false,
  disabled,
  onPick,
  backHref,
  settingsHref,
}: {
  src: string | null;
  busy?: boolean;
  disabled?: boolean;
  onPick?: (file: File) => void;
  backHref: string;
  settingsHref?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fond semi-transparent : les boutons restent visibles sur n'importe quelle photo
  const overlayButton =
    "flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div className="relative aspect-[3/1] min-h-40 w-full overflow-hidden">
      {src ? (
        // Adresse Supabase ou aperçu local : affichée telle quelle, sans l'optimisation de Next
        <Image src={src} alt={t("cover.alt")} fill sizes="500px" unoptimized className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 85% 15%, var(--cover-glow), transparent 55%), linear-gradient(135deg, var(--cover-start), var(--cover-end))",
          }}
        />
      )}

      {/* Dégradé sombre en bas (lisibilité) et léger voile en haut (boutons) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/60 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-black/30 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <Link href={backHref} className={`${overlayButton} gap-1.5 px-3.5 py-2 text-sm font-semibold`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("common.back")}
        </Link>
        {settingsHref && (
          <Link href={settingsHref} aria-label={t("cover.settings")} title={t("cover.settings")} className={`${overlayButton} h-10 w-10`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={GEAR_PATH} />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
        )}
      </div>

      {onPick && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={COVER_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // On vide le champ pour pouvoir choisir à nouveau la même photo
              e.target.value = "";
              if (file) onPick(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            aria-label={t("cover.change")}
            aria-busy={busy}
            title={t("cover.change")}
            className={`${overlayButton} absolute bottom-3 right-3 h-10 w-10 disabled:opacity-60`}
          >
            {busy ? (
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            )}
          </button>
        </>
      )}
    </div>
  );
}
