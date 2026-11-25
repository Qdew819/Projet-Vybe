import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_COLUMNS, type EventRow } from "./events";
import { loadPeople, type Person } from "./follows";
import type { MessageKey } from "./i18n";

// Publications « Quoi de neuf ? » : tables public.posts, public.post_likes, public.post_comments,
// fonction post_stats(p_posts) et espace de stockage public « posts » (un dossier par personne).
// Les règles d'accès de la base (comptes privés, blocages) filtrent déjà ce que chacun peut voir.

export const POST_BODY_MAX = 500;
export const POST_MAX_IMAGES = 4;
export const COMMENT_BODY_MAX = 300;
export const FEED_PAGE_SIZE = 10;
export const POST_BUCKET = "posts";
export const VIDEO_BUCKET = "videos";
export const POST_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const POST_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024; // avant compression (le stockage accepte 5 Mo après)

export const POST_COLUMNS = "id, author_id, body, image_urls, video_url, video_poster_url, video_duration_s, sport, event_id, created_at";
export const COMMENT_COLUMNS = "id, post_id, author_id, body, created_at";

export type PostRow = {
  id: string;
  author_id: string;
  body: string | null;
  image_urls: string[] | null;
  // Vidéo (une publication a soit des photos, soit une vidéo) : absent si la requête ne lit pas ces colonnes
  video_url?: string | null;
  video_poster_url?: string | null;
  video_duration_s?: number | null;
  sport: string | null;
  event_id: string | null;
  created_at: string;
};

export type CommentRow = { id: string; post_id: string; author_id: string; body: string; created_at: string };

export type PostStats = { likes: number; comments: number; likedByMe: boolean; views: number };
export const EMPTY_STATS: PostStats = { likes: 0, comments: 0, likedByMe: false, views: 0 };

// Tout ce qu'il faut pour afficher une page de publications
export type PostBundle = {
  posts: PostRow[];
  people: Map<string, Person>;
  stats: Map<string, PostStats>;
  events: Map<string, EventRow>;
};

export function postErrorKey(error: { message?: string; details?: string | null }): MessageKey {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (text.includes("limite_videos")) return "publish.videoLimit";
  if (text.includes("limite_publications")) return "post.errorLimit";
  if (text.includes("limite_commentaires")) return "comment.errorLimit";
  return "post.errorGeneric";
}

// ---------- Lecture du fil ----------

export type FeedQuery = {
  following: string[] | null; // null : « Pour toi » ; sinon les auteurs suivis (« Abonnements »)
  sport: string | null;
  before: string | null; // curseur : created_at de la dernière publication déjà affichée
};

export async function fetchFeedPage(supabase: SupabaseClient, query: FeedQuery): Promise<PostRow[]> {
  if (query.following && query.following.length === 0) return [];
  let request = supabase.from("posts").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(FEED_PAGE_SIZE);
  if (query.following) request = request.in("author_id", query.following);
  if (query.sport) request = request.eq("sport", query.sport);
  if (query.before) request = request.lt("created_at", query.before);
  const { data, error } = await request;
  if (error) throw new Error(`Lecture des publications impossible : ${error.message} (code ${error.code})`);
  return (data ?? []) as PostRow[];
}

// Personnes que je suis (abonnement accepté)
export async function fetchFollowingIds(supabase: SupabaseClient, me: string): Promise<string[]> {
  const { data, error } = await supabase.from("follows").select("followed_id").eq("follower_id", me).eq("status", "accepted");
  if (error) throw new Error(`Lecture des abonnements impossible : ${error.message} (code ${error.code})`);
  return (data ?? []).map((row) => String(row.followed_id));
}

// Auteurs, compteurs (une seule requête post_stats pour toute la page) et événements liés
export async function loadPostDetails(supabase: SupabaseClient, posts: PostRow[]): Promise<Omit<PostBundle, "posts">> {
  const ids = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const eventIds = [...new Set(posts.flatMap((p) => (p.event_id ? [p.event_id] : [])))];

  const [people, stats, eventsResult] = await Promise.all([
    loadPeople(supabase, authorIds).catch((err: unknown) => {
      console.error("Lecture des auteurs impossible :", err);
      return [] as Person[];
    }),
    loadPostStats(supabase, ids),
    eventIds.length > 0
      ? supabase.from("events").select(EVENT_COLUMNS).in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Événement non visible pour moi : absent de la liste, donc pas de mini-carte
  const events = new Map<string, EventRow>();
  if (eventsResult.error) {
    console.error(`Lecture des événements liés impossible : ${eventsResult.error.message} (code ${eventsResult.error.code})`);
  } else {
    for (const row of (eventsResult.data ?? []) as EventRow[]) events.set(row.id, row);
  }
  return { people: new Map(people.map((p) => [p.id, p])), stats, events };
}

// Compteurs (j'aime, commentaires, vues) de plusieurs publications en une requête. En cas d'erreur : carte vide.
export async function loadPostStats(supabase: SupabaseClient, ids: string[]): Promise<Map<string, PostStats>> {
  const stats = new Map<string, PostStats>();
  if (ids.length === 0) return stats;
  const { data, error } = await supabase.rpc("post_stats", { p_posts: ids });
  if (error) {
    console.error(`Lecture des j'aime impossible : ${error.message} (code ${error.code})`);
    return stats;
  }
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    stats.set(String(row.post_id), {
      likes: Number(row.like_count ?? 0),
      comments: Number(row.comment_count ?? 0),
      likedByMe: row.liked_by_me === true,
      views: Number(row.view_count ?? 0),
    });
  }
  return stats;
}

// ---------- J'aime ----------

export async function setLike(supabase: SupabaseClient, postId: string, me: string, liked: boolean): Promise<boolean> {
  const { error } = liked
    ? await supabase.from("post_likes").insert({ post_id: postId, user_id: me })
    : await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", me);
  // 23505 : déjà aimée (double clic) — l'état voulu est atteint
  if (error && error.code !== "23505") {
    console.error(`J'aime impossible : ${error.message} (code ${error.code})`);
    return false;
  }
  return true;
}

// ---------- Photos ----------

// Photos envoyées : côté le plus long 2048 px au maximum (une photo plus petite n'est jamais agrandie), JPEG 0,88.
// JPEG plutôt que WebP : Safari (iPhone) ne sait pas produire de WebP avec canvas.toBlob et donnerait un PNG énorme.
const IMAGE_MAX_SIDE = 2048;
const IMAGE_QUALITY = 0.88;
// Limite de l'espace de stockage « posts » : au-delà, on réencode un peu plus fort (rare à 2048 px)
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// HEIC / HEIF : sur iPhone, Safari convertit déjà la photo en JPEG à pleine résolution (le champ n'accepte que
// JPEG, PNG et WebP). Un fichier HEIC qui arrive quand même (glisser-déposer…) est décodé par le navigateur
// s'il en est capable (Safari) ; sinon la préparation échoue avec un message clair.
const HEIC_TYPES = ["image/heic", "image/heif"];

export function isAcceptedPostImage(file: Blob): boolean {
  return POST_IMAGE_ACCEPT.split(",").includes(file.type) || HEIC_TYPES.includes(file.type);
}

// Image décodée, tournée selon son orientation EXIF (photos d'iPhone prises en portrait)
async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Anciens navigateurs sans options : ils appliquent déjà l'orientation EXIF par défaut
    return createImageBitmap(file);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))), "image/jpeg", quality);
  });
}

// Réduction de bonne qualité : par moitiés successives quand l'écart est grand (évite le crénelage et le flou
// d'une seule grosse réduction), puis à la taille finale avec le lissage « high »
function drawScaled(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  let source: CanvasImageSource = bitmap;
  let sourceWidth = bitmap.width;
  let sourceHeight = bitmap.height;
  while (sourceWidth / 2 >= width * 1.5) {
    const half = document.createElement("canvas");
    half.width = Math.round(sourceWidth / 2);
    half.height = Math.round(sourceHeight / 2);
    const context = half.getContext("2d");
    if (!context) break;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, half.width, half.height);
    source = half;
    sourceWidth = half.width;
    sourceHeight = half.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");
  context.fillStyle = "#ffffff"; // les zones transparentes d'un PNG ne deviennent pas noires
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function compressPostImage(file: Blob): Promise<Blob> {
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = drawScaled(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    let quality = IMAGE_QUALITY;
    let blob = await canvasToJpeg(canvas, quality);
    while (blob.size > IMAGE_MAX_BYTES && quality > 0.6) {
      quality -= 0.08;
      blob = await canvasToJpeg(canvas, quality);
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

// Envoie une photo dans posts/<userId>/<uuid>.jpg ; renvoie son chemin (pour la supprimer) et son adresse publique
export async function uploadPostImage(supabase: SupabaseClient, userId: string, blob: Blob): Promise<{ path: string; url: string }> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(POST_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  return { path, url: supabase.storage.from(POST_BUCKET).getPublicUrl(path).data.publicUrl };
}

// Adresse publique → chemin dans un espace de stockage (null si l'adresse n'en vient pas)
export function storagePath(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

// Adresse publique → chemin dans l'espace « posts » (null si ce n'est pas une photo de publication)
export function postImagePath(url: string): string | null {
  return storagePath(url, POST_BUCKET);
}

// Vidéo (espace « videos ») et affiche (espace « posts ») ; les erreurs sont seulement notées
export async function removeVideoFiles(supabase: SupabaseClient, videoPath: string | null, posterPath: string | null): Promise<void> {
  const [video, poster] = await Promise.all([
    videoPath ? supabase.storage.from(VIDEO_BUCKET).remove([videoPath]) : Promise.resolve({ error: null }),
    posterPath ? supabase.storage.from(POST_BUCKET).remove([posterPath]) : Promise.resolve({ error: null }),
  ]);
  if (video.error) console.error(`Suppression de la vidéo impossible : ${video.error.message}`);
  if (poster.error) console.error(`Suppression de l'affiche impossible : ${poster.error.message}`);
}

export async function removePostImages(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(POST_BUCKET).remove(paths);
  if (error) console.error(`Suppression des photos impossible : ${error.message}`);
}

// Supprime ma publication, puis ses photos ou sa vidéo et son affiche. Renvoie true si c'est fait.
export async function deletePost(supabase: SupabaseClient, post: PostRow): Promise<boolean> {
  const { data, error } = await supabase.from("posts").delete().eq("id", post.id).select("id");
  if (error || !data || data.length === 0) {
    console.error(
      error ? `Suppression impossible : ${error.message} (code ${error.code})` : "Suppression impossible : aucune ligne supprimée"
    );
    return false;
  }
  await Promise.all([
    removePostImages(supabase, (post.image_urls ?? []).flatMap((url) => postImagePath(url) ?? [])),
    post.video_url || post.video_poster_url
      ? removeVideoFiles(supabase, storagePath(post.video_url, VIDEO_BUCKET), storagePath(post.video_poster_url, POST_BUCKET))
      : Promise.resolve(),
  ]);
  return true;
}
