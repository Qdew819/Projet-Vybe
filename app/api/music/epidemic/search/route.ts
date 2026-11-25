import { EpidemicError, epidemicCaller, epidemicFetch, guardResponse, toTrackOut, unavailable, type TracksPage } from "../../../../../lib/epidemic";

const PAGE = 20;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SEARCH_MAX_OFFSET = 500; // au-delà, la recherche texte renvoie une liste vide (doc « Pagination »)

// GET /api/music/epidemic/search?term=&mood=&collection=&offset=
// - collection : GET /v0/collections/{collectionId}?limit&offset
// - term (avec ou sans mood) : GET /v0/tracks/search?term&mood&limit&offset
// - mood seul : GET /v0/tracks?mood&limit&offset
// - rien : GET /v0/tracks/search?sort=Popularity&order=desc
// Pagination par offset (multiple de limit) ; page suivante seulement si links.next n'est pas null.
export async function GET(request: Request) {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();

  const params = new URL(request.url).searchParams;
  const term = (params.get("term") ?? "").trim().slice(0, 200);
  const mood = params.get("mood") ?? "";
  const collection = params.get("collection") ?? "";
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset / PAGE) * PAGE : 0;
  if ((mood && !ID.test(mood)) || (collection && !ID.test(collection))) return Response.json({ ok: false, error: "bad" }, { status: 400 });

  const query = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  let path: string;
  let textSearch = false;
  if (collection) {
    path = `/v0/collections/${encodeURIComponent(collection)}?${query}`;
  } else if (term) {
    query.set("term", term);
    if (mood) query.append("mood", mood);
    path = `/v0/tracks/search?${query}`;
    textSearch = true;
  } else if (mood) {
    query.append("mood", mood);
    path = `/v0/tracks?${query}`;
  } else {
    query.set("sort", "Popularity");
    query.set("order", "desc");
    path = `/v0/tracks/search?${query}`;
    textSearch = true;
  }

  try {
    const page = await epidemicFetch<TracksPage>(path, { partnerUserId: caller.partnerUserId });
    const tracks = (page.tracks ?? []).flatMap((track) => toTrackOut(track) ?? []);
    const more = Boolean(page.links?.next) && tracks.length > 0 && !(textSearch && offset + PAGE >= SEARCH_MAX_OFFSET);
    return Response.json({ ok: true, tracks, nextOffset: more ? offset + PAGE : null }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    return unavailable(err instanceof EpidemicError ? err.status : 503);
  }
}
