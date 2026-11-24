import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "./events";
import { loadMyStatuses, type FollowStatus, type Person } from "./follows";
import { EMPTY_STATS, POST_COLUMNS, fetchFollowingIds, loadPostDetails, type PostRow, type PostStats } from "./posts";

// Fil de vidéos plein écran (/videos) : lots de 8 vidéos.
// « Pour toi » : la vidéo touchée (?start), puis les vidéos populaires (popular_videos(30)), puis les plus récentes.
// « Abonnements » : vidéos des personnes que je suis (abonnement accepté), plus récentes d'abord.
// ?sport=<valeur de posts.sport> (filtre de l'accueil) : les deux onglets ne montrent que les vidéos de ce sport.
// Pour chaque lot : un seul post_stats, une seule lecture des profils, des événements liés et de mes abonnements.

export const REEL_BATCH = 8;
const POPULAR_MAX = 30;

export type FeedTab = "forYou" | "following";

export type Reel = {
  post: PostRow;
  author?: Person;
  stats: PostStats;
  event?: EventRow;
  follow: FollowStatus; // mon abonnement à l'auteur
  creator: boolean; // badge « Créateur »
};

// Où en est la lecture d'un onglet (gardé entre deux lots)
export type FeedCursor = {
  tab: FeedTab;
  sport: string | null; // filtre (posts.sport), null : tous les sports
  startId: string | null;
  startDone: boolean;
  popular: PostRow[] | null; // vidéos populaires lues une fois, servies au fur et à mesure
  recentBefore: string | null; // curseur created_at des vidéos récentes
  recentDone: boolean;
  following: string[] | null;
  seen: Set<string>;
  done: boolean;
};

export function newCursor(tab: FeedTab, startId: string | null, sport: string | null = null): FeedCursor {
  return {
    tab,
    sport,
    startId: tab === "forYou" ? startId : null,
    startDone: false,
    popular: null,
    recentBefore: null,
    recentDone: false,
    following: null,
    seen: new Set(),
    done: false,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vidéo de départ, par son id. Introuvable, invisible pour moi ou sans vidéo : null (on l'ignore)
export async function fetchStartVideo(supabase: SupabaseClient, id: string): Promise<PostRow | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error(`Lecture de la vidéo de départ impossible : ${error.message} (code ${error.code})`);
    return null;
  }
  const row = data as PostRow | null;
  return row?.video_url ? row : null;
}

// Vidéos récentes (éventuellement de certains auteurs), en sautant celles déjà vues
async function fetchRecent(
  supabase: SupabaseClient,
  cursor: FeedCursor,
  wanted: number,
  authors: string[] | null
): Promise<PostRow[]> {
  const found: PostRow[] = [];
  // Quelques pages au plus : les doublons (déjà vus dans les populaires) sont retirés après lecture
  for (let page = 0; page < 4 && found.length < wanted && !cursor.recentDone; page++) {
    let request = supabase
      .from("posts")
      .select(POST_COLUMNS)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(REEL_BATCH);
    if (authors) request = request.in("author_id", authors);
    if (cursor.sport) request = request.eq("sport", cursor.sport);
    if (cursor.recentBefore) request = request.lt("created_at", cursor.recentBefore);
    const { data, error } = await request;
    if (error) throw new Error(`Lecture des vidéos récentes impossible : ${error.message} (code ${error.code})`);
    const rows = (data ?? []) as PostRow[];
    if (rows.length < REEL_BATCH) cursor.recentDone = true;
    if (rows.length > 0) cursor.recentBefore = rows[rows.length - 1].created_at;
    for (const row of rows) {
      if (!cursor.seen.has(row.id) && row.video_url) {
        cursor.seen.add(row.id);
        found.push(row);
      }
    }
  }
  return found;
}

// Lot suivant (jusqu'à 8 vidéos). Modifie le curseur. onStart : la vidéo de départ, dès qu'elle est connue.
export async function fetchNextReels(
  supabase: SupabaseClient,
  me: string,
  cursor: FeedCursor,
  onStart?: (post: PostRow) => void
): Promise<PostRow[]> {
  const batch: PostRow[] = [];

  if (cursor.tab === "following") {
    if (!cursor.following) cursor.following = await fetchFollowingIds(supabase, me);
    if (cursor.following.length === 0) {
      cursor.done = true;
      return [];
    }
    batch.push(...(await fetchRecent(supabase, cursor, REEL_BATCH, cursor.following)));
    if (cursor.recentDone && batch.length < REEL_BATCH) cursor.done = true;
    return batch;
  }

  if (!cursor.startDone) {
    cursor.startDone = true;
    if (cursor.startId) {
      const start = await fetchStartVideo(supabase, cursor.startId);
      if (start) {
        cursor.seen.add(start.id);
        batch.push(start);
        onStart?.(start);
      }
    }
  }

  if (!cursor.popular) {
    const { data, error } = await supabase.rpc("popular_videos", { max_results: POPULAR_MAX, p_sport: cursor.sport });
    if (error) throw new Error(`Lecture des vidéos populaires impossible : ${error.message} (code ${error.code})`);
    cursor.popular = ((data ?? []) as PostRow[]).filter((p) => p.video_url);
  }
  while (batch.length < REEL_BATCH && cursor.popular.length > 0) {
    const next = cursor.popular.shift()!;
    if (cursor.seen.has(next.id)) continue;
    cursor.seen.add(next.id);
    batch.push(next);
  }

  if (batch.length < REEL_BATCH && !cursor.recentDone) {
    batch.push(...(await fetchRecent(supabase, cursor, REEL_BATCH - batch.length, null)));
  }
  if (cursor.popular.length === 0 && cursor.recentDone && batch.length < REEL_BATCH) cursor.done = true;
  return batch;
}

// Badge « Créateur » : appel protégé (fonction absente, droits, format inattendu → aucun badge, sans message)
async function loadCreatorFlags(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const creators = new Set<string>();
  if (ids.length === 0) return creators;
  try {
    const { data, error } = await supabase.rpc("creator_flags", { p_users: ids });
    if (error || !Array.isArray(data)) return creators;
    for (const row of data as Record<string, unknown>[]) {
      const id = row.user_id ?? row.id;
      const flag = row.is_creator ?? row.creator ?? true;
      if (typeof id === "string" && flag === true) creators.add(id);
    }
  } catch {
    // Aucun badge
  }
  return creators;
}

// Détails d'un lot : auteurs, compteurs, événements liés, mes abonnements, badges
export async function loadReels(supabase: SupabaseClient, me: string, posts: PostRow[]): Promise<Reel[]> {
  if (posts.length === 0) return [];
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const [details, statuses, creators] = await Promise.all([
    loadPostDetails(supabase, posts),
    loadMyStatuses(supabase, me, authorIds.filter((id) => id !== me)).catch((err: unknown) => {
      console.error("Lecture des abonnements impossible :", err);
      return new Map<string, FollowStatus>();
    }),
    loadCreatorFlags(supabase, authorIds),
  ]);
  return posts.map((post) => ({
    post,
    author: details.people.get(post.author_id),
    stats: details.stats.get(post.id) ?? EMPTY_STATS,
    event: post.event_id ? details.events.get(post.event_id) : undefined,
    follow: statuses.get(post.author_id) ?? null,
    creator: creators.has(post.author_id),
  }));
}
