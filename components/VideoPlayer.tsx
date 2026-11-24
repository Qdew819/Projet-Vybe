"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlayIcon } from "./home/MediaThumb";
import { useT } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";
import { formatDuration, recordView } from "../lib/videos";

// ---------- Une seule vidéo à la fois sur toute la page ----------

let activeVideo: HTMLVideoElement | null = null;

function playExclusive(video: HTMLVideoElement): Promise<void> {
  if (activeVideo && activeVideo !== video) activeVideo.pause();
  activeVideo = video;
  return video.play();
}

// ---------- Son coupé / activé : choix mémorisé pour la session, partagé par tous les lecteurs ----------

const MUTED_KEY = "vybe.videoMuted";
const mutedListeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.sessionStorage.getItem(MUTED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.sessionStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Stockage indisponible : le choix vaut jusqu'au rechargement
  }
  mutedListeners.forEach((listener) => listener());
}

function subscribeMuted(listener: () => void) {
  mutedListeners.add(listener);
  return () => mutedListeners.delete(listener);
}

// Muet au premier rendu (serveur et hydratation), puis le choix de la session
function useSessionMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, readMuted, () => true);
}

const VISIBLE_RATIO = 0.6;
const VIEW_AFTER_SECONDS = 2;

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Vidéo d'une publication : affiche + gros bouton lecture, lecture automatique muette en boucle quand 60 % est visible,
// pause hors de l'écran ou quand l'onglet est caché. Une vue est comptée après 2 s de lecture cumulées.
export default function VideoPlayer({
  postId,
  src,
  poster,
  duration,
  views,
}: {
  postId: string;
  src: string;
  poster: string | null;
  duration: number | null;
  views?: string; // « 128 vues », déjà formaté
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const muted = useSessionMuted();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const inView = useRef(false);
  const userPaused = useRef(false); // mis en pause à la main : pas de reprise automatique tant qu'elle reste à l'écran
  const watched = useRef(0);
  const lastTime = useRef(0);
  const counted = useRef(false);

  // L'attribut muted de React ne suit pas les changements : on règle la propriété directement
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Lecture automatique : son selon le choix de la session ; si le navigateur refuse le son, on relance en muet
  const autoplay = useCallback(() => {
    const video = videoRef.current;
    if (!video || failed || userPaused.current || document.hidden) return;
    playExclusive(video).catch(() => {
      if (!video.muted) {
        video.muted = true;
        playExclusive(video).catch(() => undefined);
      }
    });
  }, [failed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.intersectionRatio >= VISIBLE_RATIO;
        if (inView.current) autoplay();
        else {
          userPaused.current = false;
          video.pause();
        }
      },
      { threshold: [0, VISIBLE_RATIO] }
    );
    observer.observe(video);
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (inView.current) autoplay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
      if (activeVideo === video) activeVideo = null;
    };
  }, [autoplay]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      playExclusive(video).catch(() => undefined);
    } else {
      userPaused.current = true;
      video.pause();
    }
  }

  function toggleMute() {
    const next = !muted;
    writeMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  }

  // Temps de lecture cumulé (les sauts et le retour au début de la boucle ne comptent pas)
  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const delta = video.currentTime - lastTime.current;
    lastTime.current = video.currentTime;
    if (counted.current || delta <= 0 || delta > 1) return;
    watched.current += delta;
    if (watched.current >= VIEW_AFTER_SECONDS) {
      counted.current = true;
      recordView(createClient(), postId);
    }
  }

  function retry() {
    setFailed(false);
    userPaused.current = false;
    videoRef.current?.load();
  }

  const label = duration ? formatDuration(duration) : null;

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        muted
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
        onLoadedData={() => {
          if (inView.current) autoplay();
        }}
        className="mx-auto block max-h-[70vh] min-h-48 w-full object-contain"
      />

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center text-white">
          <p className="text-sm font-bold">{t("video.unavailable")}</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("eventForm.retry")}
          </button>
        </div>
      ) : (
        <>
          {/* Toucher la vidéo : pause / lecture */}
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? t("video.pause") : t("video.play")}
            className="absolute inset-0 flex items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#39ff14]"
          >
            {!playing && (
              <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                <PlayIcon className="ml-1 h-8 w-8" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? t("video.unmute") : t("video.mute")}
            aria-pressed={!muted}
            className="absolute bottom-2 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg {...iconProps} className="h-5 w-5">
              <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
              {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
            </svg>
          </button>
          {(label || views) && (
            <span className="pointer-events-none absolute bottom-3 right-2 flex items-center gap-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              {label && <span>{label}</span>}
              {label && views && <span aria-hidden="true">·</span>}
              {views && <span className="font-semibold text-white/85">{views}</span>}
            </span>
          )}
        </>
      )}
    </div>
  );
}
