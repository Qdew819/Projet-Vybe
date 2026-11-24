import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearch } from "./cities";
import { EVENT_COLUMNS, type EventRow } from "./events";
import { PERSON_COLUMNS, escapeLike, toPerson, type Person } from "./follows";
import type { PostRow } from "./posts";
import { fetchCatalog } from "./userSports";

// Écran de recherche (/recherche) : personnes, publications (RPC search_posts) et événements (RPC search_events).

export const SEARCH_MIN = 2;
export const PEOPLE_LIMIT = 20;
export const POSTS_PAGE = 20;
export const EVENTS_LIMIT = 20;
export const DISCOVER_LIMIT = 10;

// ---------- Personnes : même recherche que la page Communauté ----------

// Deux requêtes ilike (pseudo et nom affiché), fusionnées sans doublons ; jamais moi, jamais les personnes bloquées.
// Ceux dont le @ commence par le texte passent en premier.
export async function searchPeople(
  supabase: SupabaseClient,
  me: string,
  text: string,
  blocked: Set<string>
): Promise<Person[]> {
  const pattern = `%${escapeLike(text)}%`;
  const [byUsername, byName] = await Promise.all([
    supabase.from("profiles").select(PERSON_COLUMNS).ilike("username", pattern).neq("id", me).limit(PEOPLE_LIMIT),
    supabase.from("profiles").select(PERSON_COLUMNS).ilike("display_name", pattern).neq("id", me).limit(PEOPLE_LIMIT),
  ]);
  if (byUsername.error) throw byUsername.error;
  if (byName.error) throw byName.error;
  const merged = new Map<string, Person>();
  for (const row of [...(byUsername.data ?? []), ...(byName.data ?? [])]) {
    const person = toPerson(row);
    if (!merged.has(person.id) && !blocked.has(person.id)) merged.set(person.id, person);
  }
  const lower = text.toLowerCase();
  return [...merged.values()].sort((a, b) => {
    const aStarts = (a.username ?? "").toLowerCase().startsWith(lower) ? 0 : 1;
    const bStarts = (b.username ?? "").toLowerCase().startsWith(lower) ? 0 : 1;
    return aStarts - bStarts || (a.username ?? "").localeCompare(b.username ?? "");
  });
}

// Personnes (parmi ces identifiants) qui me suivent
export async function fetchFollowersAmong(supabase: SupabaseClient, me: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followed_id", me)
    .eq("status", "accepted")
    .in("follower_id", ids);
  if (error) {
    console.error(`Lecture des abonnés impossible : ${error.message} (code ${error.code})`);
    return new Set();
  }
  return new Set((data ?? []).map((row) => String(row.follower_id)));
}

// Ville affichée sur le profil de chacun (get_profile_city respecte « afficher ma ville »). Absente si inconnue.
export async function fetchCities(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    ids.map((uid) =>
      supabase.rpc("get_profile_city", { uid }).then(({ data, error }) => [uid, !error && typeof data === "string" ? data : ""] as const)
    )
  );
  return new Map(results.filter(([, city]) => city));
}

// Personnes à découvrir : comptes publics que je ne suis pas encore (ni moi, ni bloqués), les plus récents ;
// ceux qui ont un sport en commun avec moi passent devant, si leurs sports sont lisibles.
export async function discoverPeople(
  supabase: SupabaseClient,
  me: string,
  blocked: Set<string>,
  following: Set<string>,
  mySportIds: number[]
): Promise<Person[]> {
  const base = () => supabase.from("profiles").select(PERSON_COLUMNS).eq("is_private", false).neq("id", me).not("username", "is", null).limit(60);
  let result = await base().order("created_at", { ascending: false });
  // Pas de colonne created_at : sans tri
  if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) result = await base();
  if (result.error) throw result.error;
  const candidates = (result.data ?? []).map(toPerson).filter((p) => !blocked.has(p.id) && !following.has(p.id));
  if (candidates.length === 0 || mySportIds.length === 0) return candidates.slice(0, DISCOVER_LIMIT);

  const { data: sportRows, error } = await supabase
    .from("user_sports")
    .select("user_id, sport_id")
    .in("user_id", candidates.map((p) => p.id))
    .in("sport_id", mySportIds);
  if (error) return candidates.slice(0, DISCOVER_LIMIT);
  const shared = new Set((sportRows ?? []).map((row) => String(row.user_id)));
  return [...candidates.filter((p) => shared.has(p.id)), ...candidates.filter((p) => !shared.has(p.id))].slice(0, DISCOVER_LIMIT);
}

// ---------- Publications ----------

export async function searchPosts(supabase: SupabaseClient, text: string, before: string | null): Promise<PostRow[]> {
  const { data, error } = await supabase.rpc("search_posts", { q: text, max_results: POSTS_PAGE, before_ts: before });
  if (error) throw new Error(`Recherche de publications impossible : ${error.message} (code ${error.code})`);
  return (data ?? []) as PostRow[];
}

// ---------- Événements ----------

// search_events, plus les événements à venir du sport dont le nom correspond au texte (ex. « hockey »)
export async function searchEvents(supabase: SupabaseClient, text: string): Promise<EventRow[]> {
  const [found, catalog] = await Promise.all([
    supabase.rpc("search_events", { q: text, max_results: EVENTS_LIMIT }),
    fetchCatalog(supabase).catch(() => []),
  ]);
  if (found.error) throw new Error(`Recherche d'événements impossible : ${found.error.message} (code ${found.error.code})`);
  const events = new Map(((found.data ?? []) as EventRow[]).map((e) => [e.id, e]));

  const wanted = normalizeSearch(text);
  const slugs = catalog.filter((s) => normalizeSearch(s.name) === wanted || normalizeSearch(s.slug.replace(/[-_]/g, " ")) === wanted).map((s) => s.slug);
  if (slugs.length > 0) {
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .in("sport", slugs)
      .eq("cancelled", false)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(EVENTS_LIMIT);
    if (error) console.error(`Lecture des événements du sport impossible : ${error.message} (code ${error.code})`);
    for (const row of (data ?? []) as EventRow[]) if (!events.has(row.id)) events.set(row.id, row);
  }
  return [...events.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ---------- Recherches récentes (dans ce navigateur) ----------

const RECENT_MAX = 8;

function recentKey(userId: string): string {
  return `vybe_recent_searches_${userId}`;
}

// À lire seulement après le montage (localStorage n'existe pas sur le serveur)
export function readRecentSearches(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(userId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(userId: string, list: string[]): void {
  try {
    window.localStorage.setItem(recentKey(userId), JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Stockage indisponible (navigation privée…) : les récentes ne sont simplement pas gardées
  }
}

// Ajoute en tête (sans doublon, sans tenir compte des majuscules), 8 au maximum
export function withRecent(list: string[], text: string): string[] {
  const clean = text.trim();
  if (clean.length < SEARCH_MIN) return list;
  return [clean, ...list.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX);
}
