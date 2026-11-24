import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Aperçus publics des liens partagés (/e, /p, /u) : lus côté serveur avec la clé administrateur (service role),
// qui ignore les règles d'accès. On n'en renvoie donc QUE le strict nécessaire, et seulement pour du contenu public :
// - événement : public et non annulé ; jamais l'adresse exacte ni les participants
// - publication : auteur au compte public ; début du texte, première photo, pseudo
// - profil : compte public ; pseudo, nom, photo, bio
// Toujours lus à la demande (await connection()), jamais mis en cache : un compte qui passe en privé ou un événement
// qui devient « abonnés seulement » perd son aperçu tout de suite.
// Ce fichier ne doit être importé que par du code serveur (pages, generateMetadata, opengraph-image) :
// la clé SUPABASE_SERVICE_ROLE_KEY n'existe pas dans le navigateur.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z0-9._]{3,20}$/;
const EXCERPT_MAX = 140;

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type EventPreview = {
  title: string;
  sportName: string;
  sportEmoji: string;
  startsAt: string;
  venueName: string;
  city: string | null;
  coverUrl: string | null;
};

export type PostPreview = {
  excerpt: string;
  imageUrl: string | null;
  username: string;
  displayName: string | null;
};

export type ProfilePreview = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

async function sportOf(db: SupabaseClient, slug: string): Promise<{ name: string; emoji: string }> {
  const { data } = await db.from("sports").select("name, emoji").eq("slug", slug).maybeSingle();
  return { name: String(data?.name ?? slug), emoji: String(data?.emoji ?? "🏅") };
}

// cache() : une seule lecture par requête, partagée entre la page et generateMetadata
export const getEventPreview = cache(async (id: string): Promise<EventPreview | null> => {
  await connection();
  if (!UUID.test(id)) return null;
  const db = admin();
  if (!db) return null;
  const { data, error } = await db
    .from("events")
    .select("title, sport, starts_at, venue_name, city, cover_url, visibility, cancelled")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`Aperçu de l'événement impossible : ${error.message} (code ${error.code})`);
    return null;
  }
  // Abonnés seulement, annulé ou introuvable : aucun détail
  if (!data || data.visibility !== "public" || data.cancelled) return null;
  const sport = await sportOf(db, String(data.sport));
  return {
    title: String(data.title),
    sportName: sport.name,
    sportEmoji: sport.emoji,
    startsAt: String(data.starts_at),
    venueName: String(data.venue_name),
    city: data.city ? String(data.city) : null,
    coverUrl: data.cover_url ? String(data.cover_url) : null,
  };
});

export const getPostPreview = cache(async (id: string): Promise<PostPreview | null> => {
  await connection();
  if (!UUID.test(id)) return null;
  const db = admin();
  if (!db) return null;
  const { data: post, error } = await db.from("posts").select("author_id, body, image_urls").eq("id", id).maybeSingle();
  if (error) {
    console.error(`Aperçu de la publication impossible : ${error.message} (code ${error.code})`);
    return null;
  }
  if (!post) return null;
  const { data: author } = await db
    .from("profiles")
    .select("username, display_name, is_private")
    .eq("id", post.author_id)
    .maybeSingle();
  // Compte privé (ou profil introuvable) : rien n'est montré
  if (!author || author.is_private !== false || !author.username) return null;
  const body = String(post.body ?? "").replace(/\s+/g, " ").trim();
  const images = Array.isArray(post.image_urls) ? post.image_urls : [];
  return {
    excerpt: body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : body,
    imageUrl: typeof images[0] === "string" ? images[0] : null,
    username: String(author.username),
    displayName: author.display_name ? String(author.display_name) : null,
  };
});

export const getProfilePreview = cache(async (username: string): Promise<ProfilePreview | null> => {
  await connection();
  const clean = username.trim().toLowerCase();
  if (!USERNAME.test(clean)) return null;
  const db = admin();
  if (!db) return null;
  const { data, error } = await db
    .from("profiles")
    .select("username, display_name, avatar_url, bio, is_private")
    .eq("username", clean)
    .maybeSingle();
  if (error) {
    console.error(`Aperçu du profil impossible : ${error.message} (code ${error.code})`);
    return null;
  }
  if (!data || data.is_private !== false) return null;
  return {
    username: String(data.username),
    displayName: data.display_name ? String(data.display_name) : null,
    avatarUrl: data.avatar_url ? String(data.avatar_url) : null,
    bio: data.bio ? String(data.bio) : null,
  };
});

// ---------- Textes des aperçus (français, heure de Toronto) ----------

export const SITE_NAME = "Vybe";
export const GENERIC_TITLE = "Vybe — le réseau social des sportifs";
export const GENERIC_DESCRIPTION = "Trouve des partenaires, participe à des événements et partage ton sport sur Vybe.";

// « sam. 5 déc. · 19 h » (« 19 h 30 » si les minutes ne sont pas nulles)
export function shortEventDate(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Toronto",
  }).format(date);
  const parts = new Intl.DateTimeFormat("fr-CA", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "America/Toronto" }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${day} · ${Number(hour)} h${minute === "00" ? "" : ` ${minute}`}`;
}

export function eventDescription(event: EventPreview): string {
  return [event.title, shortEventDate(event.startsAt), event.city].filter(Boolean).join(" · ");
}
