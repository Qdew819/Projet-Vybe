// TEMP-DEBUG : tout ce fichier est temporaire. À supprimer une fois le problème de l'accueil en production trouvé.
//
// GET /api/diag : rejoue les requêtes Supabase de l'accueil (fil, vidéos populaires, événements…) et renvoie en JSON,
// pour chacune, ok / nombre de lignes / erreur Supabase (message, code, details, hint).
// - « avec_session » : client serveur @supabase/ssr qui lit les cookies de session, donc exactement le même compte et
//   les mêmes droits que le navigateur sur l'accueil.
// - « sans_session » : même requêtes avec la seule clé publique (rôle anon), pour comparer.
// « env » indique seulement si chaque variable est définie (jamais sa valeur).
//
// Note : `export const dynamic = 'force-dynamic'` est refusé au build quand cacheComponents est activé (Next 16) ;
// `await connection()` a le même effet : la route est exécutée à chaque requête, jamais mise en cache.

import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { EVENT_COLUMNS } from "../../../lib/events";
import { POST_COLUMNS } from "../../../lib/posts";
import { createClient as createSessionClient } from "../../../lib/supabase/server";

type Check = {
  nom: string;
  ok: boolean;
  lignes: number | null;
  erreur?: { message: string; code: string | null; details: string | null; hint: string | null };
};

type Result = { data: unknown; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null };

function toCheck(nom: string, result: Result): Check {
  if (result.error) {
    return {
      nom,
      ok: false,
      lignes: null,
      erreur: {
        message: result.error.message,
        code: result.error.code ?? null,
        details: result.error.details ?? null,
        hint: result.error.hint ?? null,
      },
    };
  }
  return { nom, ok: true, lignes: Array.isArray(result.data) ? result.data.length : result.data === null ? 0 : 1 };
}

async function run(nom: string, query: PromiseLike<Result>): Promise<Check> {
  try {
    return toCheck(nom, await query);
  } catch (err) {
    return { nom, ok: false, lignes: null, erreur: { message: err instanceof Error ? err.message : String(err), code: null, details: null, hint: null } };
  }
}

// Les requêtes de l'accueil (components/home/PostFeed.tsx, PopularVideos.tsx, HomeEvents.tsx, app/accueil/page.tsx)
async function homeQueries(supabase: SupabaseClient, userId: string | null): Promise<Check[]> {
  const checks: Check[] = [];
  const posts = await supabase.from("posts").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(10);
  checks.push(toCheck("publications", posts));
  const ids = ((posts.data ?? []) as { id: string }[]).map((p) => p.id);
  checks.push(await run("post_stats", supabase.rpc("post_stats", { p_posts: ids })));
  checks.push(await run("videos_populaires", supabase.rpc("popular_videos", { max_results: 12, p_sport: null })));
  checks.push(
    await run(
      "evenements",
      supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .gt("starts_at", new Date().toISOString())
        .eq("cancelled", false)
        .order("starts_at", { ascending: true })
        .limit(12)
    )
  );
  checks.push(await run("profils", supabase.from("profiles").select("id, username, display_name, avatar_url, is_private").limit(5)));
  checks.push(await run("sports", supabase.from("sports").select("id").limit(5)));
  if (userId) {
    checks.push(await run("abonnements", supabase.from("follows").select("followed_id").eq("follower_id", userId).eq("status", "accepted")));
    checks.push(await run("mon_profil", supabase.from("profiles").select("avatar_url, display_name, username").eq("id", userId).maybeSingle()));
    checks.push(await run("ma_ville", supabase.from("user_locations").select("user_id").eq("user_id", userId).maybeSingle()));
    checks.push(await run("mes_inscriptions", supabase.from("event_participants").select("*").eq("user_id", userId)));
  }
  return checks;
}

export async function GET() {
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  };
  // Version déployée (identifiant public du commit, pas un secret) : pour savoir quel code tourne
  const deploiement = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    branche: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  };

  if (!url || !key) {
    return NextResponse.json({ env, deploiement, erreur: "Variables Supabase manquantes" }, { headers: { "Cache-Control": "no-store" } });
  }

  // Avec la session (cookies du navigateur)
  let session: { connecte: boolean; erreur: string | null } = { connecte: false, erreur: null };
  let avecSession: Check[] = [];
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.getUser();
    session = { connecte: Boolean(data.user), erreur: error ? `${error.message}${error.code ? ` (code ${error.code})` : ""}` : null };
    avecSession = await homeQueries(supabase, data.user?.id ?? null);
  } catch (err) {
    session = { connecte: false, erreur: err instanceof Error ? err.message : String(err) };
  }

  // Sans session (rôle anon), pour comparer
  const anon = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sansSession = await homeQueries(anon, null);

  return NextResponse.json(
    { env, deploiement, session, avec_session: avecSession, sans_session: sansSession },
    { headers: { "Cache-Control": "no-store" } }
  );
}
