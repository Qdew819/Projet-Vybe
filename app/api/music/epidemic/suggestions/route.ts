import { createHash } from "node:crypto";
import {
  EpidemicError,
  epidemicCaller,
  epidemicFetch,
  guardResponse,
  toTrackOut,
  unavailable,
  type EpidemicTrackOut,
  type TracksPage,
} from "../../../../../lib/epidemic";
import { postMoodKeywords } from "../../../../../lib/musicKeywords";

// POST /api/music/epidemic/suggestions (multipart) : suggestions de musique selon la publication en cours.
// Champs : image (JPEG ≤ 512 px, facultatif), kind ("photo" | "video"), sport (posts.sport), text (texte de la publication).
// Endpoints Epidemic Sound (guide « Search by video » et recherche classique) :
//   1. POST /v0/uploads/images (multipart, champ « file », JPEG ≤ 2 Mo) → imageId
//   2. GET /v0/tracks/matching-image/{imageId}?limit → morceaux qui collent à l'image
//   3. DELETE /v0/uploads/images/{imageId} → l'image est supprimée tout de suite chez Epidemic Sound
//   4. GET /v0/tracks/search?term=<mots-clés sport + texte> pour compléter (ou sort=Popularity si rien)
// L'image n'est JAMAIS stockée chez nous : elle sert seulement à l'appel, et seule son empreinte sert de clé de cache.
// TODO(confidentialité) : mentionner dans la future politique de confidentialité que, pour suggérer une musique, une
// image réduite du premier média de la publication est envoyée à Epidemic Sound (puis supprimée de leur côté).

const WANTED = 10;
const MIN_WANTED = 6;
const MAX_IMAGE_BYTES = 600 * 1024; // le navigateur envoie ~50 Ko (512 px, JPEG 0,7) ; Epidemic accepte 2 Mo
const CACHE_MS = 60 * 60 * 1000; // 60 minutes au maximum (règle d'Epidemic Sound)
const USER_LIMIT = 20; // calculs de suggestions par heure et par personne (hors réponses déjà en cache)
const USER_WINDOW_MS = 60 * 60 * 1000;

type Basis = "photo" | "video" | "sport" | "text" | "popular";
type Result = { tracks: EpidemicTrackOut[]; basis: Basis };

const cache = new Map<string, { at: number; value: Result }>();
const computed = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const now = Date.now();
  const recent = (computed.get(userId) ?? []).filter((at) => now - at < USER_WINDOW_MS);
  if (recent.length >= USER_LIMIT) {
    computed.set(userId, recent);
    return false;
  }
  recent.push(now);
  computed.set(userId, recent);
  return true;
}

export async function POST(request: Request) {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "bad" }, { status: 400 });
  const image = form.get("image");
  const kind = form.get("kind") === "video" ? "video" : "photo";
  const sport = String(form.get("sport") ?? "").slice(0, 64) || null;
  const text = String(form.get("text") ?? "").slice(0, 600);
  const keywords = postMoodKeywords(sport, text);

  let bytes: Uint8Array | null = null;
  if (image instanceof Blob && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES || (image.type && image.type !== "image/jpeg")) return Response.json({ ok: false, error: "bad" }, { status: 400 });
    bytes = new Uint8Array(await image.arrayBuffer());
  }

  // Cache : empreinte de l'image + sport + mots-clés (60 min au plus)
  const fingerprint = bytes ? createHash("sha256").update(bytes).digest("hex") : "none";
  const key = `${fingerprint}|${kind}|${sport ?? ""}|${keywords.join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json({ ok: true, ...hit.value, cached: true });
  if (!allowed(caller.userId)) return Response.json({ ok: false, error: "rate" }, { status: 429 });

  const opts = { partnerUserId: caller.partnerUserId };
  const tracks: EpidemicTrackOut[] = [];
  const add = (list: unknown[] | undefined) => {
    for (const raw of list ?? []) {
      const track = toTrackOut(raw as Parameters<typeof toTrackOut>[0]);
      if (track && !tracks.some((t) => t.id === track.id) && tracks.length < WANTED) tracks.push(track);
    }
  };
  let basis: Basis = "popular";

  try {
    // 1. Recherche par image (photo, ou image tirée du milieu de la vidéo)
    if (bytes) {
      let imageId: string | null = null;
      try {
        const upload = new FormData();
        upload.append("file", new Blob([bytes as BlobPart], { type: "image/jpeg" }), "frame.jpg");
        const uploaded = await epidemicFetch<{ imageId?: string }>("/v0/uploads/images", { ...opts, method: "POST", form: upload });
        imageId = uploaded?.imageId ?? null;
        if (imageId) {
          const page = await epidemicFetch<TracksPage>(`/v0/tracks/matching-image/${encodeURIComponent(imageId)}?limit=${WANTED}`, {
            ...opts,
            fresh: true,
            ttl: 0,
          });
          const before = tracks.length;
          add(page.tracks);
          if (tracks.length > before) basis = kind;
        }
      } catch (err) {
        // Recherche par image indisponible : on continue avec les mots-clés
        console.error("Suggestions Epidemic Sound (image) :", err instanceof Error ? err.message : err);
      } finally {
        // L'image n'est pas gardée chez Epidemic Sound non plus
        if (imageId) {
          await epidemicFetch(`/v0/uploads/images/${encodeURIComponent(imageId)}`, { ...opts, method: "DELETE" }).catch(() => undefined);
        }
      }
    }

    // 2. Complément par mots-clés (sport + texte), sans doublons
    if (tracks.length < MIN_WANTED && keywords.length > 0) {
      const query = new URLSearchParams({ term: keywords.join(" "), limit: String(WANTED) });
      const page = await epidemicFetch<TracksPage>(`/v0/tracks/search?${query}`, opts);
      const before = tracks.length;
      add(page.tracks);
      if (basis === "popular" && tracks.length > before) basis = sport && postMoodKeywords(sport, "").length > 0 ? "sport" : "text";
    }

    // 3. Rien du tout : morceaux populaires
    if (tracks.length < MIN_WANTED) {
      const page = await epidemicFetch<TracksPage>(`/v0/tracks/search?sort=Popularity&order=desc&limit=${WANTED}&offset=0`, opts);
      add(page.tracks);
    }
  } catch (err) {
    if (tracks.length === 0) return unavailable(err instanceof EpidemicError ? err.status : 503, err);
  }

  const value: Result = { tracks, basis };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
  }
  return Response.json({ ok: true, ...value });
}
