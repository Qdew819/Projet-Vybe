import { createHash } from "node:crypto";
import { createClient as createSessionClient } from "./supabase/server";

// Epidemic Sound (côté serveur UNIQUEMENT) : https://developers.epidemicsound.com/docs/
// - Base : https://api.epidemicsound.com ; authentification par clé API : « Authorization: Bearer <clé> ».
//   La clé (EPIDEMIC_SOUND_API_KEY) ne quitte jamais le serveur ; le navigateur appelle nos routes /api/music/epidemic/*.
// - En-tête x-partner-user-id : identifiant stable et anonymisé de la personne (recommandé par la doc).
// - Cache : 60 minutes au maximum pour les morceaux et collections (règle d'Epidemic Sound). Dans notre base, on ne
//   garde que posts.music_external_id. Les URL de lecture (HLS) expirent : elles sont demandées au moment de jouer.

const BASE_URL = "https://api.epidemicsound.com";
const CACHE_MAX_MS = 60 * 60 * 1000;
export const CACHE_TTL_MS = 30 * 60 * 1000; // < 60 min

export class EpidemicError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// ---------- Personne connectée + limite simple de requêtes ----------

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60; // requêtes par minute et par personne (par instance du serveur)
const hits = new Map<string, number[]>();

export type EpidemicCaller = { userId: string; partnerUserId: string };

// null si personne n'est connecté ; "limited" si la limite est dépassée
export async function epidemicCaller(): Promise<EpidemicCaller | null | "limited"> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(user.id, recent);
    return "limited";
  }
  recent.push(now);
  hits.set(user.id, recent);
  // Nettoyage occasionnel des personnes inactives
  if (hits.size > 5000) for (const [id, list] of hits) if (!list.some((at) => now - at < RATE_WINDOW_MS)) hits.delete(id);
  return { userId: user.id, partnerUserId: createHash("sha256").update(`vybe:${user.id}`).digest("hex").slice(0, 32) };
}

// ---------- Appels à l'API ----------

export function epidemicConfigured(): boolean {
  return Boolean(process.env.EPIDEMIC_SOUND_API_KEY);
}

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();

// GET (avec cache mémoire de ttl ≤ 60 min) ou POST vers l'API Epidemic Sound. Lève EpidemicError en cas d'échec.
export async function epidemicFetch<T>(
  path: string,
  {
    partnerUserId,
    method = "GET",
    body,
    ttl = CACHE_TTL_MS,
    fresh = false,
  }: { partnerUserId: string; method?: "GET" | "POST"; body?: unknown; ttl?: number; fresh?: boolean }
): Promise<T> {
  const key = process.env.EPIDEMIC_SOUND_API_KEY;
  if (!key) throw new EpidemicError("EPIDEMIC_SOUND_API_KEY manquante", 503);

  const cacheKey = method === "GET" ? path : null;
  if (cacheKey && !fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "x-partner-user-id": partnerUserId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    // 401 clé invalide, 402 crédits épuisés, 403 droits insuffisants, 429 limite atteinte… (détails dans les journaux)
    const text = await response.text().catch(() => "");
    console.error(`Epidemic Sound ${method} ${path.split("?")[0]} : ${response.status} ${text.slice(0, 300)}`);
    throw new EpidemicError(`Epidemic Sound a répondu ${response.status}`, response.status);
  }
  const value = (await response.json()) as T;
  if (cacheKey) {
    cache.set(cacheKey, { at: Date.now(), ttl: Math.min(ttl, CACHE_MAX_MS), value });
    if (cache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of cache) if (now - v.at >= v.ttl) cache.delete(k);
    }
  }
  return value;
}

// ---------- Ce qu'on renvoie au navigateur (le strict nécessaire) ----------

type ApiTrack = {
  id?: string;
  title?: string;
  mainArtists?: string[];
  featuredArtists?: string[] | null;
  length?: number; // secondes
  images?: { default?: string | null; XS?: string | null; S?: string | null; M?: string | null; L?: string | null } | null;
};

export type EpidemicTrackOut = { id: string; title: string; artist: string; cover: string | null; duration: number | null };

export function toTrackOut(track: ApiTrack): EpidemicTrackOut | null {
  if (!track.id) return null;
  const images = track.images ?? {};
  return {
    id: track.id,
    title: track.title ?? "",
    artist: [...(track.mainArtists ?? []), ...(track.featuredArtists ?? [])].join(", "),
    cover: images.S ?? images.M ?? images.default ?? images.XS ?? null,
    duration: typeof track.length === "number" ? track.length : null,
  };
}

export type TracksPage = { tracks?: ApiTrack[]; pagination?: { limit?: number; offset?: number }; links?: { next?: string | null } };

// Réponse d'erreur commune : le navigateur sait seulement que le service est indisponible
export function unavailable(status = 503) {
  return Response.json({ ok: false, error: "unavailable" }, { status: status === 429 ? 429 : 503 });
}

export function guardResponse(caller: EpidemicCaller | null | "limited"): Response | null {
  if (caller === null) return Response.json({ ok: false, error: "auth" }, { status: 401 });
  if (caller === "limited") return Response.json({ ok: false, error: "rate" }, { status: 429 });
  if (!epidemicConfigured()) return unavailable();
  return null;
}
