"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useT } from "../../lib/i18n";
import type { MusicTrack } from "../../lib/music";
import { formatDuration } from "../../lib/videos";

// Ligne « ♪ Titre · Artiste » sous le nom de l'auteur. Le texte défile s'il est trop long (sauf si la personne
// préfère réduire les mouvements : il est alors coupé). Un clic ouvre le crédit et la licence du morceau
// (obligatoire pour les licences CC BY : titre, artiste, nom de la licence et lien vers celle-ci).
export default function MusicCredit({ track, variant = "card" }: { track: MusicTrack; variant?: "card" | "reel" }) {
  const t = useT();
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const [open, setOpen] = useState(false);

  const label = track.artist ? `${track.title} · ${track.artist}` : track.title;

  // Défile seulement si le texte dépasse (mesuré après l'affichage, et à chaque changement de largeur)
  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => setScrolling(!reduce.matches && text.scrollWidth > box.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    reduce.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      reduce.removeEventListener("change", measure);
    };
  }, [label]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const reel = variant === "reel";
  const duration = Math.max(6, label.length * 0.25);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("music.creditButton").replace("{title}", track.title).replace("{artist}", track.artist)}
        className={`flex min-h-6 max-w-full items-center gap-1.5 rounded text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${
          reel
            ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] focus-visible:outline-white"
            : "text-muted hover:text-foreground focus-visible:outline-accent-ink"
        }`}
      >
        <span aria-hidden="true" className={reel ? "text-[#39ff14]" : "text-accent-ink"}>
          ♪
        </span>
        <span ref={boxRef} aria-hidden="true" className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          {scrolling ? (
            <span className="music-marquee inline-flex" style={{ ["--marquee-duration" as string]: `${duration}s` }}>
              <span ref={textRef} className="pr-8">
                {label}
              </span>
              <span className="pr-8">{label}</span>
            </span>
          ) : (
            <span ref={textRef} className="block truncate">
              {label}
            </span>
          )}
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`credit-${track.id}`}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-[min(92vw,380px)] rounded-3xl border border-line bg-background p-0 text-foreground backdrop:bg-black/70"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-2xl text-accent-ink">
              {track.cover_url ? <Image src={track.cover_url} alt="" fill unoptimized sizes="64px" className="object-cover" /> : <span aria-hidden="true">♪</span>}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("music.creditTitle")}</p>
              <h2 id={`credit-${track.id}`} className="break-words text-lg font-bold leading-tight">
                {track.title}
              </h2>
              {track.artist && <p className="break-words text-sm text-muted">{t("music.by").replace("{artist}", track.artist)}</p>}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {track.duration_s ? (
              <>
                <dt className="text-muted">{t("music.duration")}</dt>
                <dd className="tabular-nums">{formatDuration(track.duration_s)}</dd>
              </>
            ) : null}
            <dt className="text-muted">{t("music.licenseLabel")}</dt>
            <dd className="break-words">{track.license || t("music.licenseUnknown")}</dd>
          </dl>
          {track.license_url && (
            <a
              href={track.license_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              {t("music.licenseLink")}
            </a>
          )}
          <p className="text-xs leading-snug text-muted">{t("music.fromLibrary")}</p>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="min-h-11 rounded-full border-2 border-line font-bold transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {t("common.close")}
          </button>
        </div>
      </dialog>
    </>
  );
}
