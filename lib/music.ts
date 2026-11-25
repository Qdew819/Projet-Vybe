"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

// Deux sources de musique : la bibliothèque Vybe (posts.music_provider = 'vybe', posts.music_track_id) et
// Epidemic Sound (music_provider = 'epidemic', posts.music_external_id). Pour Epidemic Sound, on ne garde dans la
// base que l'identifiant : titre, artiste et pochette passent par nos routes serveur /api/music/epidemic/* (la clé
// d'API ne va jamais dans le navigateur), et l'URL de lecture est demandée au moment de jouer (elle expire).
//
// Bibliothèque musicale Vybe : table public.music_tracks (musiques libres de droits ajoutées par l'équipe, fichiers
// dans l'espace public « music »). Les personnes CHOISISSENT un morceau de cette liste : il n'existe aucun moyen
// d'importer son propre fichier audio. Réglages de chaque publication : posts.music_track_id, music_start_s,
// music_volume (0–1), original_sound (son des vidéos gardé ou non), original_volume (0–1).

export const MUSIC_COLUMNS = "id, title, artist, audio_url, cover_url, duration_s, license, license_url, is_active";

export type MusicProvider = "vybe" | "epidemic";

export type MusicTrack = {
  provider: MusicProvider;
  id: string; // music_tracks.id (Vybe) ou identifiant Epidemic Sound
  title: string;
  artist: string;
  audio_url: string; // vide pour Epidemic Sound (URL de lecture demandée au moment de jouer)
  cover_url: string | null;
  duration_s: number | null;
  license: string | null;
  license_url: string | null;
  is_active: boolean;
};

// Source à jouer (lib/sound.ts : useMusicPlayer)
export type MusicSource = { kind: "file"; url: string } | { kind: "epidemic"; id: string };

export function musicSource(track: MusicTrack | null): MusicSource | null {
  if (!track) return null;
  if (track.provider === "epidemic") return { kind: "epidemic", id: track.id };
  return track.audio_url ? { kind: "file", url: track.audio_url } : null;
}

function toTrack(row: Record<string, unknown>): MusicTrack {
  return {
    provider: "vybe",
    id: String(row.id),
    title: String(row.title ?? ""),
    artist: String(row.artist ?? ""),
    audio_url: String(row.audio_url ?? ""),
    cover_url: typeof row.cover_url === "string" && row.cover_url ? row.cover_url : null,
    duration_s: typeof row.duration_s === "number" ? row.duration_s : row.duration_s != null ? Number(row.duration_s) || null : null,
    license: typeof row.license === "string" && row.license ? row.license : null,
    license_url: typeof row.license_url === "string" && row.license_url ? row.license_url : null,
    is_active: row.is_active !== false,
  };
}

// Morceaux proposés dans /publier (actifs seulement)
export async function fetchActiveTracks(supabase: SupabaseClient): Promise<MusicTrack[]> {
  const { data, error } = await supabase
    .from("music_tracks")
    .select(MUSIC_COLUMNS)
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw new Error(`Lecture de la bibliothèque musicale impossible : ${error.message} (code ${error.code})`);
  return (data ?? []).map((row) => toTrack(row as Record<string, unknown>));
}

// ---------- Morceau d'une publication (lu une fois, regroupé pour toutes les cartes de la page) ----------

const cache = new Map<string, Promise<MusicTrack | null>>();
let pending: { id: string; resolve: (track: MusicTrack | null) => void }[] = [];
let flushScheduled = false;

function flush() {
  flushScheduled = false;
  const batch = pending;
  pending = [];
  const ids = [...new Set(batch.map((item) => item.id))];
  if (ids.length === 0) return;
  // Un morceau désactivé depuis reste lisible sur les publications qui l'utilisent déjà (si la base le permet)
  createClient()
    .from("music_tracks")
    .select(MUSIC_COLUMNS)
    .in("id", ids)
    .then(({ data, error }) => {
      if (error) console.error(`Lecture des musiques impossible : ${error.message} (code ${error.code})`);
      const byId = new Map((data ?? []).map((row) => [String((row as { id: unknown }).id), toTrack(row as Record<string, unknown>)]));
      batch.forEach((item) => item.resolve(byId.get(item.id) ?? null));
      if (error) ids.forEach((id) => cache.delete(id)); // nouvel essai à la prochaine demande
    });
}

export function loadTrack(id: string): Promise<MusicTrack | null> {
  let promise = cache.get(id);
  if (!promise) {
    promise = new Promise((resolve) => {
      pending.push({ id, resolve });
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    });
    cache.set(id, promise);
  }
  return promise;
}

// Morceau d'une publication, selon sa source. null pendant la lecture, ou si le morceau est introuvable ou que le
// service ne répond pas : la publication s'affiche alors simplement sans musique.
export function useMusicTrack(provider: MusicProvider, id: string | null | undefined): MusicTrack | null {
  const key = id ? `${provider}:${id}` : null;
  const [loaded, setLoaded] = useState<{ key: string; track: MusicTrack | null } | null>(null);
  useEffect(() => {
    if (!id || !key) return;
    let cancelled = false;
    void (provider === "epidemic" ? loadEpidemicTrack(id) : loadTrack(id)).then((track) => {
      if (!cancelled) setLoaded({ key, track });
    });
    return () => {
      cancelled = true;
    };
  }, [provider, id, key]);
  return key && loaded?.key === key ? loaded.track : null;
}

// ---------- Epidemic Sound (par nos routes serveur) ----------

// Cache du navigateur : 30 minutes (Epidemic Sound autorise 60 minutes au maximum)
const EPIDEMIC_CACHE_MS = 30 * 60 * 1000;

export type EpidemicTrackOut = { id: string; title: string; artist: string; cover: string | null; duration: number | null };

export function fromEpidemic(track: EpidemicTrackOut): MusicTrack {
  return {
    provider: "epidemic",
    id: track.id,
    title: track.title,
    artist: track.artist,
    audio_url: "",
    cover_url: track.cover,
    duration_s: track.duration,
    license: null,
    license_url: null,
    is_active: true,
  };
}

const epidemicCache = new Map<string, { at: number; promise: Promise<MusicTrack | null> }>();
let epidemicPending: { id: string; resolve: (track: MusicTrack | null) => void }[] = [];
let epidemicFlush = false;

function flushEpidemic() {
  epidemicFlush = false;
  const batch = epidemicPending;
  epidemicPending = [];
  const ids = [...new Set(batch.map((item) => item.id))];
  if (ids.length === 0) return;
  fetch(`/api/music/epidemic/tracks?ids=${encodeURIComponent(ids.join(","))}`)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
    .then((data: { tracks?: EpidemicTrackOut[] }) => {
      const byId = new Map((data.tracks ?? []).map((track) => [track.id, fromEpidemic(track)]));
      batch.forEach((item) => item.resolve(byId.get(item.id) ?? null));
    })
    .catch((err: unknown) => {
      console.warn("Musique Epidemic Sound indisponible :", err);
      batch.forEach((item) => item.resolve(null));
      ids.forEach((id) => epidemicCache.delete(id)); // nouvel essai plus tard
    });
}

export function loadEpidemicTrack(id: string): Promise<MusicTrack | null> {
  const hit = epidemicCache.get(id);
  if (hit && Date.now() - hit.at < EPIDEMIC_CACHE_MS) return hit.promise;
  const promise = new Promise<MusicTrack | null>((resolve) => {
    epidemicPending.push({ id, resolve });
    if (!epidemicFlush) {
      epidemicFlush = true;
      queueMicrotask(flushEpidemic);
    }
  });
  epidemicCache.set(id, { at: Date.now(), promise });
  return promise;
}

// URL de lecture HLS : demandée au moment de jouer, gardée jusqu'à 5 min avant son expiration (55 min au plus)
const streams = new Map<string, { url: string; until: number }>();

export async function fetchEpidemicStream(id: string): Promise<string | null> {
  const hit = streams.get(id);
  if (hit && Date.now() < hit.until) return hit.url;
  try {
    const response = await fetch(`/api/music/epidemic/stream?id=${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string; expires?: string | null };
    if (!data.url) return null;
    const expires = data.expires ? Date.parse(data.expires) : NaN;
    const until = Math.min(Date.now() + 55 * 60 * 1000, Number.isFinite(expires) ? expires - 5 * 60 * 1000 : Infinity);
    streams.set(id, { url: data.url, until });
    return data.url;
  } catch {
    return null;
  }
}

export function forgetEpidemicStream(id: string): void {
  streams.delete(id);
}

export type EpidemicFilter = { term: string; mood: string | null; collection: string | null };
export type EpidemicPage = { tracks: MusicTrack[]; nextOffset: number | null };
export type EpidemicBrowse = { moods: { id: string; name: string }[]; collections: { id: string; name: string; cover: string | null }[] };

// Délai maximum d'un appel du panneau : au-delà, on affiche « indisponible » avec « Réessayer » (jamais d'attente infinie)
export const EPIDEMIC_CLIENT_TIMEOUT_MS = 10000;

// GET d'une de nos routes Epidemic Sound, abandonné après 10 s ; l'erreur porte le message réel (affiché en développement)
async function epidemicGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), EPIDEMIC_CLIENT_TIMEOUT_MS);
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string };
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${data.error ? ` (${data.error})` : ""}${data.detail ? ` : ${data.detail}` : ""}`);
    }
    return data;
  } catch (err) {
    if (signal?.aborted) throw err; // annulé par l'appelant : pas une panne
    if (controller.signal.aborted) throw new Error(`Pas de réponse après ${EPIDEMIC_CLIENT_TIMEOUT_MS / 1000} s (${url.split("?")[0]})`);
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

// Liste du panneau « Ajouter une musique » (lève une erreur si le service est indisponible ou trop lent)
export async function searchEpidemic(filter: EpidemicFilter, offset: number, signal?: AbortSignal): Promise<EpidemicPage> {
  const query = new URLSearchParams({ offset: String(offset) });
  if (filter.term.trim()) query.set("term", filter.term.trim());
  if (filter.mood) query.set("mood", filter.mood);
  if (filter.collection) query.set("collection", filter.collection);
  const data = await epidemicGet<{ tracks?: EpidemicTrackOut[]; nextOffset?: number | null }>(`/api/music/epidemic/search?${query}`, signal);
  return { tracks: (data.tracks ?? []).map(fromEpidemic), nextOffset: data.nextOffset ?? null };
}

export async function browseEpidemic(signal?: AbortSignal): Promise<EpidemicBrowse> {
  const data = await epidemicGet<Partial<EpidemicBrowse>>("/api/music/epidemic/browse", signal);
  return { moods: data.moods ?? [], collections: data.collections ?? [] };
}

// Signale la publication à Epidemic Sound (côté serveur). Sans attendre : la publication est déjà faite.
export function reportEpidemicUsage(postId: string): void {
  void fetch("/api/music/epidemic/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
    keepalive: true,
  }).catch(() => undefined);
}

// ---------- Réglages de son d'une publication ----------

export type PostSound = {
  provider: MusicProvider;
  trackId: string | null; // music_tracks.id (Vybe) ou music_external_id (Epidemic Sound)
  start: number;
  musicVolume: number;
  originalSound: boolean;
  originalVolume: number;
};

const unit = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : value != null ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

export function postSound(post: {
  music_provider?: string | null;
  music_external_id?: string | null;
  music_track_id?: string | null;
  music_start_s?: number | null;
  music_volume?: number | null;
  original_sound?: boolean | null;
  original_volume?: number | null;
}): PostSound {
  const start = Number(post.music_start_s ?? 0);
  const provider: MusicProvider = post.music_provider === "epidemic" ? "epidemic" : "vybe";
  const trackId = provider === "epidemic" ? post.music_external_id : post.music_track_id;
  return {
    provider,
    trackId: trackId ? String(trackId) : null,
    start: Number.isFinite(start) ? Math.max(0, start) : 0,
    musicVolume: unit(post.music_volume, 1),
    originalSound: post.original_sound !== false,
    originalVolume: unit(post.original_volume, 1),
  };
}
