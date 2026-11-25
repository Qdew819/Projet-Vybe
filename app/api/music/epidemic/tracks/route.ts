import { EpidemicError, epidemicCaller, epidemicFetch, guardResponse, toTrackOut, unavailable } from "../../../../../lib/epidemic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_IDS = 50; // la doc conseille de rester sous ~90 identifiants par requête

// GET /api/music/epidemic/tracks?ids=a,b : titre, artiste, pochette et durée (GET /v0/tracks/metadata?trackId=…)
// pour la ligne « ♪ Titre · Artiste » des publications. Rien n'est stocké dans notre base à part l'identifiant.
export async function GET(request: Request) {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();

  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => ID.test(id)))].sort().slice(0, MAX_IDS);
  if (ids.length === 0) return Response.json({ ok: true, tracks: [] });

  const query = new URLSearchParams();
  ids.forEach((id) => query.append("trackId", id));
  try {
    const list = await epidemicFetch<unknown>(`/v0/tracks/metadata?${query}`, { partnerUserId: caller.partnerUserId });
    const tracks = (Array.isArray(list) ? list : []).flatMap((track) => toTrackOut(track) ?? []);
    return Response.json({ ok: true, tracks }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    return unavailable(err instanceof EpidemicError ? err.status : 503);
  }
}
