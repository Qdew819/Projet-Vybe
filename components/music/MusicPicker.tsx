"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "../../lib/i18n";
import { fetchActiveTracks, type MusicTrack } from "../../lib/music";
import { unlockAudio, useMusicPlayer } from "../../lib/sound";
import { normalizeSearch } from "../../lib/sports";
import { createClient } from "../../lib/supabase/client";
import { useCloseDialogOnHide } from "../../lib/useCloseDialogOnHide";
import { useMounted } from "../../lib/useMounted";
import { formatDuration } from "../../lib/videos";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; tracks: MusicTrack[] };

// Panneau « Ajouter une musique » (feuille qui monte du bas sur téléphone, fenêtre centrée sur ordinateur) :
// morceaux ACTIFS de la bibliothèque Vybe uniquement (aucun import de fichier audio possible), recherche par titre
// ou artiste, ▶ pour écouter un extrait (un seul à la fois, arrêté à la fermeture).
export default function MusicPicker({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (track: MusicTrack) => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, mounted]);

  // Liste lue à l'ouverture (et après « Réessayer »)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchActiveTracks(createClient()).then(
      (tracks) => !cancelled && setLoad({ status: "ready", tracks }),
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setLoad({ status: "error" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  const tracks = useMemo(() => {
    if (load.status !== "ready") return [];
    const words = normalizeSearch(query).split(" ").filter(Boolean);
    if (words.length === 0) return load.tracks;
    return load.tracks.filter((track) => {
      const text = normalizeSearch(`${track.title} ${track.artist}`);
      return words.every((word) => text.includes(word));
    });
  }, [load, query]);

  // Un seul extrait à la fois (depuis le début du morceau, 30 s en boucle)
  const playing = open && playingId ? (load.status === "ready" ? load.tracks.find((track) => track.id === playingId) : undefined) : undefined;
  useMusicPlayer({ ownerKey: "music-picker", url: playing?.audio_url ?? null, start: 0, volume: 1, playing: Boolean(playing) });

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="music-picker-title"
      onClose={() => {
        setPlayingId(null);
        setQuery("");
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto flex max-h-[85dvh] w-full max-w-[500px] flex-col rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70 md:mb-auto md:rounded-3xl md:border-b"
    >
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line md:hidden" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="music-picker-title" className="text-lg font-bold">
              {t("music.library")}
            </h2>
            <p className="text-xs text-muted">{t("music.libraryHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <label htmlFor="music-search" className="sr-only">
          {t("music.search")}
        </label>
        <input
          id="music-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("music.search")}
          className="mt-3 min-h-11 w-full rounded-full border border-accent-ink/40 bg-surface px-4 text-base text-foreground outline-none placeholder:text-subtle focus:border-accent-ink"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {load.status === "loading" && (
            <ul aria-hidden="true" className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((n) => (
                <li key={n} className="flex items-center gap-3 py-1">
                  <div className="h-12 w-12 animate-pulse rounded-lg bg-surface" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {load.status === "error" && (
            <p className="flex flex-wrap items-center gap-3 py-4 text-sm text-danger">
              {t("music.error")}
              <button
                type="button"
                onClick={() => {
                  setLoad({ status: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className="min-h-11 font-bold text-accent-ink underline"
              >
                {t("eventForm.retry")}
              </button>
            </p>
          )}
          {load.status === "ready" && tracks.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">{load.tracks.length === 0 ? t("music.empty") : t("music.noResult")}</p>
          )}
          {load.status === "ready" && tracks.length > 0 && (
            <ul className="flex flex-col">
              {tracks.map((track) => {
                const isPlaying = playingId === track.id;
                return (
                  <li key={track.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudio(); // pendant le geste : nécessaire pour le son sur iPhone
                        setPlayingId(isPlaying ? null : track.id);
                      }}
                      aria-pressed={isPlaying}
                      aria-label={(isPlaying ? t("music.pause") : t("music.play")).replace("{title}", track.title)}
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    >
                      {track.cover_url && <Image src={track.cover_url} alt="" fill unoptimized sizes="48px" className="object-cover" />}
                      <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                        {isPlaying ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                            <rect x="6" y="5" width="4" height="14" rx="1" />
                            <rect x="14" y="5" width="4" height="14" rx="1" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
                            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
                          </svg>
                        )}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{track.title}</p>
                      <p className="truncate text-xs text-muted">
                        {track.artist}
                        {track.duration_s ? ` · ${formatDuration(track.duration_s)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onChoose(track);
                        dialogRef.current?.close();
                      }}
                      aria-label={t("music.chooseTrack").replace("{title}", track.title).replace("{artist}", track.artist)}
                      className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    >
                      {t("music.choose")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
