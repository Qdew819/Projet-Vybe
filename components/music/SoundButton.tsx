"use client";

import { useT } from "../../lib/i18n";
import { toggleSound, useSoundOn } from "../../lib/sound";

// Bouton haut-parleur : active ou coupe le son pour toute la page (choix gardé pendant la visite, lib/sound.ts)
export default function SoundButton({ className = "" }: { className?: string }) {
  const t = useT();
  const on = useSoundOn();
  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={on}
      aria-label={on ? t("video.mute") : t("video.unmute")}
      title={on ? t("video.mute") : t("video.unmute")}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
        {on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
      </svg>
    </button>
  );
}
