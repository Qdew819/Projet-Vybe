import type { SupabaseClient } from "@supabase/supabase-js";

// Abonnements : opérations communes à /u/[username], /personnes et /parametres/confidentialite

export type FollowStatus = "pending" | "accepted" | null;

// Personne telle qu'affichée dans les listes (photo, nom, @, cadenas)
export type Person = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPrivate: boolean;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_private: boolean | null;
};

export const PERSON_COLUMNS = "id, username, display_name, avatar_url, is_private";

export function toPerson(row: ProfileRow): Person {
  return {
    id: row.id,
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    isPrivate: row.is_private === true,
  };
}

// follows et blocks ne sont pas liés à profiles : on lit les profils à part, avec la liste des identifiants.
// On garde l'ordre des identifiants ; un profil illisible (personne qui nous a bloqué) reste dans la liste
// sans nom, pour qu'on puisse quand même agir dessus.
export async function loadPeople(supabase: SupabaseClient, ids: string[]): Promise<Person[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", ids);
  if (error) throw error;
  const byId = new Map((data as ProfileRow[]).map((row) => [row.id, toPerson(row)]));
  return ids.map((id) => byId.get(id) ?? { id, username: null, displayName: null, avatarUrl: null, isPrivate: false });
}

// Mon statut d'abonnement avec chacune de ces personnes (absente de la carte = je ne la suis pas)
export async function loadMyStatuses(supabase: SupabaseClient, me: string, ids: string[]): Promise<Map<string, FollowStatus>> {
  const statuses = new Map<string, FollowStatus>();
  if (ids.length === 0) return statuses;
  const { data, error } = await supabase.from("follows").select("followed_id, status").eq("follower_id", me).in("followed_id", ids);
  if (error) throw error;
  for (const row of data ?? []) statuses.set(row.followed_id as string, row.status as FollowStatus);
  return statuses;
}

// S'abonner : insert SANS status (la base choisit « pending » pour un compte privé, sinon « accepted »),
// puis on relit la ligne pour connaître le statut décidé
export async function followUser(supabase: SupabaseClient, me: string, targetId: string): Promise<FollowStatus> {
  const { error } = await supabase.from("follows").insert({ follower_id: me, followed_id: targetId });
  if (error) throw error;
  const { data, error: readError } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", me)
    .eq("followed_id", targetId)
    .maybeSingle();
  if (readError) throw readError;
  return (data?.status as FollowStatus) ?? "pending";
}

// Se désabonner ou annuler une demande : on supprime ma ligne
export async function unfollowUser(supabase: SupabaseClient, me: string, targetId: string): Promise<void> {
  const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("followed_id", targetId);
  if (error) throw error;
}

// Texte saisi utilisé dans un motif ilike : \, % et _ sont échappés pour être cherchés tels quels
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Nom à afficher et à lire à voix haute pour une personne
export function personName(person: Person, fallback: string): string {
  return person.displayName || person.username || fallback;
}
