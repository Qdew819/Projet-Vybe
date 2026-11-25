import { createClient as createSessionClient } from "../../../../../lib/supabase/server";
import { EpidemicError, epidemicCaller, epidemicFetch, guardResponse, unavailable } from "../../../../../lib/epidemic";

// POST /api/music/epidemic/usage { postId } : signale à Epidemic Sound qu'un morceau a été publié
// (POST /v0/usage { eventType: "EXPORTED", platform: "OTHER", trackIds }). La doc demande de signaler les exports
// (contenu publié sur une plateforme), pas les écoutes ni les extraits. La publication est relue avec la session :
// on ne signale que la publication Epidemic Sound de la personne connectée.
export async function POST(request: Request) {
  const caller = await epidemicCaller();
  const blocked = guardResponse(caller);
  if (blocked) return blocked;
  if (!caller || caller === "limited") return unavailable();

  const body = (await request.json().catch(() => null)) as { postId?: unknown } | null;
  const postId = typeof body?.postId === "string" ? body.postId : "";
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return Response.json({ ok: false, error: "bad" }, { status: 400 });

  const supabase = await createSessionClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select("author_id, music_provider, music_external_id")
    .eq("id", postId)
    .maybeSingle();
  if (error || !post || post.author_id !== caller.userId || post.music_provider !== "epidemic" || !post.music_external_id) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  try {
    await epidemicFetch("/v0/usage", {
      partnerUserId: caller.partnerUserId,
      method: "POST",
      body: { eventType: "EXPORTED", platform: "OTHER", trackIds: [String(post.music_external_id)], other: "Vybe" },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return unavailable(err instanceof EpidemicError ? err.status : 503);
  }
}
