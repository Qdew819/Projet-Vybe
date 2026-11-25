import { EpidemicError, epidemicCaller, epidemicFetch, guardResponse, unavailable } from "../../../../../lib/epidemic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MARGIN_MS = 5 * 60 * 1000;
const MAX_MS = 55 * 60 * 1000;

type Stream = { url?: string; expires?: string };

// GET /api/music/epidemic/stream?id= : URL de lecture HLS signée (GET /v0/tracks/{trackId}/stream → { url, expires }).
// Demandée au moment de jouer (l'URL expire) ; gardée en mémoire au plus 55 min et jamais jusqu'à son expiration.
export async function GET(request: Request) {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return Response.json({ ok: false, error: "bad" }, { status: 400 });
  const path = `/v0/tracks/${encodeURIComponent(id)}/stream`;
  try {
    let stream = await epidemicFetch<Stream>(path, { partnerUserId: caller.partnerUserId, ttl: MAX_MS });
    const expiresAt = stream.expires ? Date.parse(stream.expires) : NaN;
    // Réponse en cache trop proche de l'expiration : on en redemande une, sans cache
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() < MARGIN_MS) {
      stream = await epidemicFetch<Stream>(path, { partnerUserId: caller.partnerUserId, ttl: 0, fresh: true });
    }
    if (!stream.url) return unavailable();
    return Response.json({ ok: true, url: stream.url, expires: stream.expires ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return unavailable(err instanceof EpidemicError ? err.status : 503);
  }
}
