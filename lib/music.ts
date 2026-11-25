"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

// Bibliothèque musicale Vybe : table public.music_tracks (musiques libres de droits ajoutées par l'équipe, fichiers
// dans l'espace public « music »). Les personnes CHOISISSENT un morceau de cette liste : il n'existe aucun moyen
// d'importer son propre fichier audio. Réglages de chaque publication : posts.music_track_id, music_start_s,
// music_volume (0–1), original_sound (son des vidéos gardé ou non), original_volume (0–1).

export const MUSIC_COLUMNS = "id, title, artist, audio_url, cover_url, duration_s, license, license_url, is_active";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string | null;
  duration_s: number | null;
  license: string | null;
  license_url: string | null;
  is_active: boolean;
};

function toTrack(row: Record<string, unknown>): MusicTrack {
  return {
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

export function useMusicTrack(id: string | null | undefined): MusicTrack | null {
  const [loaded, setLoaded] = useState<{ id: string; track: MusicTrack | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadTrack(id).then((track) => {
      if (!cancelled) setLoaded({ id, track });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return id && loaded?.id === id ? loaded.track : null;
}

// ---------- Réglages de son d'une publication ----------

export type PostSound = {
  trackId: string | null;
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
  music_track_id?: string | null;
  music_start_s?: number | null;
  music_volume?: number | null;
  original_sound?: boolean | null;
  original_volume?: number | null;
}): PostSound {
  const start = Number(post.music_start_s ?? 0);
  return {
    trackId: post.music_track_id ? String(post.music_track_id) : null,
    start: Number.isFinite(start) ? Math.max(0, start) : 0,
    musicVolume: unit(post.music_volume, 1),
    originalSound: post.original_sound !== false,
    originalVolume: unit(post.original_volume, 1),
  };
}
