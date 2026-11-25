"use client";

import { useState } from "react";
import Image from "next/image";
import MusicPicker from "./MusicPicker";
import Switch from "../Switch";
import { useT } from "../../lib/i18n";
import { musicSource, type MusicTrack } from "../../lib/music";
import { MUSIC_CLIP_SECONDS, unlockAudio, useMusicPlayer } from "../../lib/sound";
import { formatDuration } from "../../lib/videos";

export type SoundChoice = {
  originalSound: boolean;
  originalVolume: number; // 0 à 1
  track: MusicTrack | null;
  musicStart: number; // secondes
  musicVolume: number; // 0 à 1
};

export const DEFAULT_SOUND: SoundChoice = { originalSound: true, originalVolume: 1, track: null, musicStart: 0, musicVolume: 0.8 };

// Section « Son » de /publier : son d'origine des vidéos (s'il y en a) et musique de la bibliothèque Vybe.
// Aucun champ de fichier audio : la musique se choisit uniquement dans la bibliothèque (MusicPicker).
export default function SoundSection({
  value,
  onChange,
  hasVideo,
  disabled,
}: {
  value: SoundChoice;
  onChange: (next: SoundChoice) => void;
  hasVideo: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const { track } = value;

  // Passage de 30 s : départ entre 0 et (durée − 30 s)
  const maxStart = Math.max(0, Math.floor((track?.duration_s ?? 0) - MUSIC_CLIP_SECONDS));
  const start = Math.min(value.musicStart, maxStart);
  const end = track?.duration_s ? Math.min(track.duration_s, start + MUSIC_CLIP_SECONDS) : start + MUSIC_CLIP_SECONDS;

  // Préécoute du passage choisi, au volume choisi (arrêtée pendant le choix d'un autre morceau)
  useMusicPlayer({
    ownerKey: "publish-preview",
    source: musicSource(track),
    start,
    volume: value.musicVolume,
    playing: listening && Boolean(track) && !pickerOpen,
  });

  const set = (patch: Partial<SoundChoice>) => onChange({ ...value, ...patch });
  const percent = (n: number) => `${Math.round(n * 100)} %`;
  const range =
    "h-11 w-full cursor-pointer accent-[#39ff14] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section aria-labelledby="titre-son" className="mt-5">
      <h2 id="titre-son" className="mb-2 text-sm font-bold">
        {t("sound.title")} <span className="font-normal text-muted">{t("eventForm.photoOptional")}</span>
      </h2>

      <div className="flex flex-col gap-3">
        {hasVideo && (
          <div className="flex flex-col gap-1">
            <Switch
              id="son-origine"
              label={t("sound.original")}
              hint={t("sound.originalHint")}
              checked={value.originalSound}
              disabled={disabled}
              onChange={(checked) => set({ originalSound: checked })}
            />
            <label htmlFor="volume-origine" className="mt-1 flex items-center justify-between px-1 text-xs font-semibold text-muted">
              <span>{t("sound.originalVolume")}</span>
              <span className="tabular-nums">{percent(value.originalVolume)}</span>
            </label>
            <input
              id="volume-origine"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.originalVolume * 100)}
              disabled={disabled || !value.originalSound}
              onChange={(e) => set({ originalVolume: Number(e.target.value) / 100 })}
              className={range}
            />
          </div>
        )}

        {track ? (
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-xl text-accent-ink">
                {track.cover_url ? <Image src={track.cover_url} alt="" fill unoptimized sizes="48px" className="object-cover" /> : <span aria-hidden="true">♪</span>}
              </span>
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
                  unlockAudio(); // pendant le geste : nécessaire pour le son sur iPhone
                  setListening((on) => !on);
                }}
                aria-pressed={listening}
                className="min-h-10 shrink-0 rounded-full border-2 border-accent-ink px-3 text-xs font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
              >
                {listening ? t("sound.stop") : t("sound.listen")}
              </button>
            </div>

            {maxStart > 0 && (
              <>
                <label htmlFor="debut-musique" className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
                  <span>{t("sound.start")}</span>
                  <span className="tabular-nums">
                    {t("sound.window").replace("{from}", formatDuration(start)).replace("{to}", formatDuration(end))}
                  </span>
                </label>
                <input
                  id="debut-musique"
                  type="range"
                  min={0}
                  max={maxStart}
                  step={1}
                  value={start}
                  disabled={disabled}
                  onChange={(e) => set({ musicStart: Number(e.target.value) })}
                  aria-valuetext={t("sound.window").replace("{from}", formatDuration(start)).replace("{to}", formatDuration(end))}
                  className={range}
                />
              </>
            )}

            <label htmlFor="volume-musique" className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
              <span>{t("sound.musicVolume")}</span>
              <span className="tabular-nums">{percent(value.musicVolume)}</span>
            </label>
            <input
              id="volume-musique"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(value.musicVolume * 100)}
              disabled={disabled}
              onChange={(e) => set({ musicVolume: Number(e.target.value) / 100 })}
              className={range}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={disabled}
                className="min-h-11 flex-1 rounded-full border-2 border-line text-sm font-bold transition-colors hover:border-accent-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
              >
                {t("sound.changeMusic")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setListening(false);
                  set({ track: null, musicStart: 0 });
                }}
                disabled={disabled}
                className="min-h-11 flex-1 rounded-full border-2 border-danger/60 text-sm font-bold text-danger disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
              >
                {t("sound.removeMusic")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-ink/50 px-3 text-sm font-bold text-accent-ink transition-colors hover:border-accent-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ♪
            </span>
            {t("sound.addMusic")}
          </button>
        )}
      </div>

      <MusicPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onChoose={(chosen) => {
          setListening(false);
          set({ track: chosen, musicStart: 0 });
        }}
      />
    </section>
  );
}
