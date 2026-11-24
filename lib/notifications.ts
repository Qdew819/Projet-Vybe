import type { SupabaseClient } from "@supabase/supabase-js";

// Notifications : table public.notifications (remplie par des déclencheurs de la base), lisible et supprimable
// seulement par son destinataire (user_id). RPC mark_notifications_read(p_ids) : null = tout marquer comme lu.

export const NOTIFICATION_COLUMNS = "id, user_id, actor_id, type, post_id, event_id, data, read_at, created_at";
export const NOTIFICATIONS_PAGE = 30;

export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "post_like"
  | "post_comment"
  | "event_join"
  | "event_join_request"
  | "event_waitlist"
  | "event_request_accepted"
  | "event_request_refused"
  | "event_waitlist_promoted"
  | "event_removed"
  | "event_announcement"
  | "event_cancelled";

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  post_id: string | null;
  event_id: string | null;
  data: { event_title?: string; snippet?: string } | null;
  read_at: string | null;
  created_at: string;
};

// ---------- Préférences (Paramètres → Notifications, table user_settings) ----------

// Chaque type suit la préférence la plus proche. Les j'aime et commentaires n'ont pas de réglage : toujours affichés.
const FOLLOW_TYPES = ["follow_request", "new_follower", "follow_accepted"];
const EVENT_TYPES = [
  "event_join",
  "event_join_request",
  "event_waitlist",
  "event_request_accepted",
  "event_request_refused",
  "event_waitlist_promoted",
  "event_removed",
  "event_announcement",
  "event_cancelled",
];

// Types masqués d'après mes réglages (rien de masqué si la lecture échoue ou s'il n'y a pas encore de réglages)
export async function fetchHiddenTypes(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("notify_follow_requests, notify_events")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`Lecture des réglages de notification impossible : ${error.message} (code ${error.code})`);
    return [];
  }
  return [...(data?.notify_follow_requests === false ? FOLLOW_TYPES : []), ...(data?.notify_events === false ? EVENT_TYPES : [])];
}

// Filtre PostgREST « type pas dans la liste » : not.in.(a,b)
function notIn(types: string[]): string {
  return `(${types.map((t) => `"${t}"`).join(",")})`;
}

// Nombre de notifications non lues (types masqués exclus)
export async function countUnread(supabase: SupabaseClient, userId: string, hidden: string[]): Promise<number> {
  let query = supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  if (hidden.length > 0) query = query.not("type", "in", notIn(hidden));
  const { count, error } = await query;
  if (error) throw new Error(`Comptage des notifications impossible : ${error.message} (code ${error.code})`);
  return count ?? 0;
}

// Une page de notifications, plus récentes d'abord ; before = created_at de la dernière déjà affichée
export async function fetchNotifications(
  supabase: SupabaseClient,
  userId: string,
  hidden: string[],
  before: string | null
): Promise<NotificationRow[]> {
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_PAGE);
  if (hidden.length > 0) query = query.not("type", "in", notIn(hidden));
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw new Error(`Lecture des notifications impossible : ${error.message} (code ${error.code})`);
  return (data ?? []) as NotificationRow[];
}

export async function markRead(supabase: SupabaseClient, ids: string[] | null): Promise<boolean> {
  const { error } = await supabase.rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
  if (error) {
    console.error(`Marquage comme lu impossible : ${error.message} (code ${error.code})`);
    return false;
  }
  return true;
}

// ---------- Regroupement des j'aime ----------

// Une ligne affichée : une notification, ou plusieurs j'aime sur la même publication
export type NotificationItem = {
  key: string;
  type: string;
  ids: string[];
  actorIds: string[]; // le plus récent d'abord
  main: NotificationRow; // la plus récente du groupe
  unread: boolean;
};

export function groupNotifications(rows: NotificationRow[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  const likesByPost = new Map<string, NotificationItem>();
  for (const row of rows) {
    if (row.type === "post_like" && row.post_id) {
      const existing = likesByPost.get(row.post_id);
      if (existing) {
        existing.ids.push(row.id);
        if (row.actor_id && !existing.actorIds.includes(row.actor_id)) existing.actorIds.push(row.actor_id);
        existing.unread = existing.unread || !row.read_at;
        continue;
      }
      const item: NotificationItem = {
        key: `like:${row.post_id}`,
        type: row.type,
        ids: [row.id],
        actorIds: row.actor_id ? [row.actor_id] : [],
        main: row,
        unread: !row.read_at,
      };
      likesByPost.set(row.post_id, item);
      items.push(item);
      continue;
    }
    items.push({ key: row.id, type: row.type, ids: [row.id], actorIds: row.actor_id ? [row.actor_id] : [], main: row, unread: !row.read_at });
  }
  return items;
}
