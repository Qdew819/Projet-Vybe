"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { fetchEpidemicStream, forgetEpidemicStream, type MusicSource } from "./music";

// Son des publications (vidéos et musique), partagé par toute la page.
//
// - Tout démarre en muet (les navigateurs bloquent le son automatique). Le bouton haut-parleur active le son ; ce choix
//   est gardé pour la visite (sessionStorage). Après un rechargement, le son ne revient qu'au premier geste
//   (toucher, clic, touche) : avant, le navigateur refuserait de toute façon de le jouer.
// - Volumes : Safari (iPhone) ignore la propriété .volume des balises audio/vidéo. Chaque élément audible passe donc
//   par la Web Audio API (AudioContext → GainNode), créée au premier geste de l'utilisateur. Les fichiers viennent
//   du stockage Supabase, qui répond avec les en-têtes CORS : les balises doivent avoir crossOrigin="anonymous",
//   sinon le son passerait en silence dans le graphe audio.
// - Un seul son à la fois : chaque publication qui joue « prend » le son (claimSound) et arrête la précédente.

// ---------- Choix « son activé » (pour la visite) ----------

const SOUND_KEY = "vybe.soundOn";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readStored(): boolean {
  try {
    return window.sessionStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStored(on: boolean) {
  try {
    window.sessionStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    // Stockage indisponible : le choix vaut jusqu'au rechargement
  }
}

let memoryChoice: boolean | null = null;
function soundWanted(): boolean {
  return memoryChoice ?? readStored();
}

// ---------- AudioContext (créé au premier geste) ----------

type AudioContextClass = typeof AudioContext;
let context: AudioContext | null = null;
const gains = new WeakMap<HTMLMediaElement, GainNode>();
// Éléments lus en HLS natif depuis un autre domaine : jamais reliés à Web Audio (WebKit y rendrait du silence)
const directElements = new WeakSet<HTMLMediaElement>();
let gestureListening = false;

function audioRunning(): boolean {
  return context?.state === "running";
}

// À appeler PENDANT un geste (clic sur le haut-parleur, ▶ d'un extrait) : crée ou relance l'AudioContext
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!context) {
    const Ctor: AudioContextClass | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    context.onstatechange = notify;
  }
  if (context.state !== "running") void context.resume().then(notify, () => undefined);
  notify();
}

// Son activé mais pas encore de geste dans cette page (rechargement) : on attend le premier geste
function listenForGesture() {
  if (gestureListening || typeof window === "undefined") return;
  gestureListening = true;
  const onGesture = () => {
    if (soundWanted()) unlockAudio();
    if (audioRunning()) {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      gestureListening = false;
    }
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (soundWanted() && !audioRunning()) listenForGesture();
  return () => listeners.delete(listener);
}

// Le son est-il réellement audible ? (activé ET AudioContext en marche). false au premier rendu.
export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, () => soundWanted() && audioRunning(), () => false);
}

// Active ou coupe le son pour toute la page (à appeler pendant le geste qui le demande)
export function setSoundOn(on: boolean): void {
  memoryChoice = on;
  writeStored(on);
  if (on) unlockAudio();
  else stopAllSound();
  notify();
}

export function toggleSound(): void {
  setSoundOn(!(soundWanted() && audioRunning()));
}

// Volume d'un élément audio/vidéo (0 à 1), appliqué par un GainNode (seul moyen fiable sur iPhone)
export function setMediaVolume(element: HTMLMediaElement, volume: number): void {
  const value = Math.max(0, Math.min(1, volume));
  if (!context || directElements.has(element)) {
    element.volume = value;
    return;
  }
  let gain = gains.get(element);
  if (!gain) {
    try {
      const source = context.createMediaElementSource(element);
      gain = context.createGain();
      source.connect(gain).connect(context.destination);
      gains.set(element, gain);
    } catch {
      // Élément déjà relié ou navigateur sans Web Audio : on se contente de .volume
      element.volume = value;
      return;
    }
  }
  gain.gain.value = value;
}

// ---------- Un seul son à la fois ----------

let owner: string | null = null;
const stops = new Map<string, Set<() => void>>();

// Une publication commence à jouer : celle qui jouait s'arrête. stop : arrête ce lecteur-ci.
export function claimSound(key: string, stop: () => void): () => void {
  if (owner && owner !== key) {
    stops.get(owner)?.forEach((fn) => fn());
    stops.delete(owner);
  }
  owner = key;
  const set = stops.get(key) ?? new Set<() => void>();
  set.add(stop);
  stops.set(key, set);
  return () => {
    set.delete(stop);
    if (set.size === 0 && owner === key) {
      stops.delete(key);
      owner = null;
    }
  };
}

function stopAllSound() {
  stops.forEach((set) => set.forEach((fn) => fn()));
  stops.clear();
  owner = null;
}

// ---------- Visibilité d'un élément (plus de 60 % à l'écran) ----------

export const SOUND_VISIBLE_RATIO = 0.6;

export function useVisible(ref: RefObject<Element | null>, ratio = SOUND_VISIBLE_RATIO): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= ratio), { threshold: [0, ratio] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, ratio]);
  return visible;
}

// ---------- Musique d'une publication ----------

export const MUSIC_CLIP_SECONDS = 30;

// Lecture HLS d'un morceau Epidemic Sound (URL signée demandée à notre serveur au moment de jouer).
// hls.js n'est pas installé : on utilise la lecture HLS native du navigateur (Safari sur Mac et iPhone, et les
// navigateurs qui la proposent). Ailleurs, le morceau ne joue pas (la publication s'affiche sans musique).
// Le flux vient d'un autre domaine : il n'est pas relié à Web Audio (WebKit rendrait du silence), son volume
// passe par .volume.
async function attachEpidemic(audio: HTMLAudioElement, id: string): Promise<boolean> {
  const url = await fetchEpidemicStream(id);
  if (!url) return false;
  if (!audio.canPlayType("application/vnd.apple.mpegurl")) {
    console.warn("Lecture HLS indisponible dans ce navigateur : musique Epidemic Sound ignorée");
    return false;
  }
  directElements.add(audio);
  audio.src = url;
  return true;
}

type Player = { audio: HTMLAudioElement; ready: boolean; failed: boolean };

// Joue la musique à partir de start, en boucle sur 30 s, au volume donné, tant que playing est vrai.
// Un seul élément <audio> par publication, créé hors du rendu ; pause dès que playing devient faux.
// Morceau Epidemic Sound : l'URL de lecture est demandée seulement quand il faut jouer (elle expire).
// En cas d'échec (service indisponible, URL refusée…), rien ne joue et rien ne plante.
export function useMusicPlayer({
  ownerKey,
  source,
  start,
  volume,
  playing,
}: {
  ownerKey: string;
  source: MusicSource | null;
  start: number;
  volume: number;
  playing: boolean;
}): void {
  const playerRef = useRef<Player | null>(null);
  const sourceKey = source ? (source.kind === "file" ? `file:${source.url}` : `epidemic:${source.id}`) : null;

  useEffect(() => {
    if (!source) return;
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    if (source.kind === "file") audio.src = source.url;
    const player: Player = { audio, ready: source.kind === "file", failed: false };
    playerRef.current = player;
    const onError = () => {
      // URL expirée ou refusée : la prochaine lecture redemandera une URL neuve
      if (source.kind === "epidemic") {
        forgetEpidemicStream(source.id);
        player.ready = false;
      }
    };
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (playerRef.current === player) playerRef.current = null;
    };
    // sourceKey résume source (évite de recréer l'élément à chaque rendu)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const { audio } = player;
    if (!playing) {
      audio.pause();
      return;
    }
    let cancelled = false;
    let teardown: (() => void) | null = null;

    const begin = () => {
      const from = Math.max(0, start);
      const loopEnd = () =>
        Math.min(from + MUSIC_CLIP_SECONDS, Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity);
      const seekToStart = () => {
        try {
          audio.currentTime = from;
        } catch {
          // Métadonnées pas encore lues : on réessaie à loadedmetadata
        }
      };
      const onTime = () => {
        if (audio.currentTime >= loopEnd() - 0.05 || audio.currentTime < from - 0.5) seekToStart();
      };
      const onEnded = () => {
        seekToStart();
        void audio.play().catch(() => undefined);
      };
      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("ended", onEnded);
      if (audio.readyState >= 1) {
        if (audio.currentTime < from || audio.currentTime >= loopEnd()) seekToStart();
      } else {
        audio.addEventListener("loadedmetadata", seekToStart, { once: true });
      }
      setMediaVolume(audio, volume);
      const release = claimSound(ownerKey, () => audio.pause());
      void audio.play().catch(() => undefined);
      teardown = () => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("loadedmetadata", seekToStart);
        release();
      };
    };

    if (player.ready) {
      begin();
    } else if (source?.kind === "epidemic" && !player.failed) {
      void attachEpidemic(audio, source.id).then(
        (ok) => {
          if (!ok) player.failed = true;
          else player.ready = true;
          if (ok && !cancelled) begin();
        },
        () => {
          player.failed = true;
        }
      );
    }

    return () => {
      cancelled = true;
      teardown?.();
      audio.pause();
    };
    // sourceKey résume source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, start, volume, ownerKey, sourceKey]);
}
