import { EpidemicError, epidemicCaller, epidemicFetch, guardResponse, unavailable } from "../../../../../lib/epidemic";

type MoodsResponse = { moods?: { id?: string; name?: string }[] };
type CollectionsResponse = { collections?: { id?: string; name?: string; images?: { S?: string | null; default?: string | null } | null }[] };

// GET /api/music/epidemic/browse : ambiances mises en avant (GET /v0/moods?type=featured) et collections
// (GET /v0/collections?excludeField=tracks), pour les filtres du panneau « Ajouter une musique »
export async function GET() {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();
  try {
    const [moods, collections] = await Promise.all([
      epidemicFetch<MoodsResponse>("/v0/moods?type=featured&limit=20", { partnerUserId: caller.partnerUserId }),
      epidemicFetch<CollectionsResponse>("/v0/collections?excludeField=tracks&limit=20", { partnerUserId: caller.partnerUserId }),
    ]);
    return Response.json(
      {
        ok: true,
        moods: (moods.moods ?? []).flatMap((m) => (m.id && m.name ? [{ id: m.id, name: m.name }] : [])),
        collections: (collections.collections ?? []).flatMap((c) =>
          c.id && c.name ? [{ id: c.id, name: c.name, cover: c.images?.S ?? c.images?.default ?? null }] : []
        ),
      },
      { headers: { "Cache-Control": "private, max-age=600" } }
    );
  } catch (err) {
    return unavailable(err instanceof EpidemicError ? err.status : 503, err);
  }
}
