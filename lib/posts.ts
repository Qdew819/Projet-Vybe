import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_COLUMNS, type EventRow } from "./events";
import { loadPeople, type Person } from "./follows";
import { parseFraming, renderFramedImage, type Framing } from "./framing";
import { parseOverlays, type MediaOverlay } from "./overlayData";
import type { MessageKey } from "./i18n";

// Publications « Quoi de neuf ? » : tables public.posts, public.post_likes, public.post_comments,
// fonction post_stats(p_posts) et espace de stockage public « posts » (un dossier par personne).
// Les règles d'accès de la base (comptes privés, blocages) filtrent déjà ce que chacun peut voir.

export const POST_BODY_MAX = 500;
// Éléments d'une publication (photos et vidéos mélangées, colonne posts.media). Mêmes limites que dans la base.
// Seule source de ces valeurs dans le code.
export const MAX_POST_MEDIA = 15;
export const MAX_POST_VIDEOS = 5;
export const COMMENT_BODY_MAX = 300;
export const FEED_PAGE_SIZE = 10;
export const POST_BUCKET = "posts";
export const VIDEO_BUCKET = "videos";
export const POST_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const POST_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024; // avant compression (le stockage accepte 5 Mo après)

export const POST_COLUMNS =
  "id, author_id, kind, body, media, image_urls, video_url, video_poster_url, video_duration_s, music_provider, music_external_id, music_track_id, music_start_s, music_volume, original_sound, original_volume, sport, event_id, created_at, edited_at";
export const COMMENT_COLUMNS = "id, post_id, author_id, body, created_at";

export type PostRow = {
  id: string;
  author_id: string;
  // 'post' (photos, texte, carrousel) ou 'video' (une vidéo verticale plein écran, façon Reels) ; défaut 'post'
  kind?: "post" | "video" | null;
  body: string | null;
  // Liste ordonnée des photos et vidéos (posts.media). Vide ou absente pour les anciennes publications :
  // lire avec postMedia(), qui la reconstruit à partir de video_url et image_urls
  media?: unknown;
  image_urls: string[] | null;
  // Compatibilité : photos dans l'ordre et PREMIÈRE vidéo de media. Absent si la requête ne lit pas ces colonnes
  video_url?: string | null;
  video_poster_url?: string | null;
  video_duration_s?: number | null;
  // Son (lib/music.ts : postSound) : musique de la bibliothèque Vybe et son d'origine des vidéos
  music_provider?: string | null; // 'vybe' | 'epidemic'
  music_external_id?: string | null; // identifiant Epidemic Sound (seulement si music_provider = 'epidemic')
  music_track_id?: string | null; // music_tracks.id (seulement si music_provider = 'vybe')
  music_start_s?: number | null;
  music_volume?: number | null;
  original_sound?: boolean | null;
  original_volume?: number | null;
  sport: string | null;
  event_id: string | null;
  created_at: string;
  edited_at?: string | null; // rempli par la base à chaque modification (« · modifié »)
};

// framing : cadrage d'une VIDÉO dans le cadre 4:5 (lib/framing.ts) ; les photos sont recadrées avant l'envoi
export type MediaItem = {
  type: "image" | "video";
  url: string;
  poster?: string | null;
  duration_s?: number | null;
  framing?: Framing | null;
  alt?: string | null; // photo : texte écrit sur l'image (accessibilité)
  // Photo modifiée dans l'éditeur : photo de base (non recadrée, sans texte) gardée pour la re-modifier sans perte ;
  // framing et overlays décrivent alors ce qui a été appliqué à url (jamais redessinés à l'affichage des photos)
  source?: string | null;
  overlays?: MediaOverlay[] | null; // vidéo : textes affichés par-dessus (lib/overlayData.ts)
};

function parseMedia(value: unknown): MediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): MediaItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if ((item.type !== "image" && item.type !== "video") || typeof item.url !== "string" || !item.url) return [];
    if (item.type === "image") {
      const alt = typeof item.alt === "string" ? item.alt.slice(0, 1300) : "";
      const source = typeof item.source === "string" && item.source ? item.source : null;
      const framing = source ? parseFraming(item.framing) : null;
      const overlays = source ? parseOverlays(item.overlays) : null;
      return [
        {
          type: "image",
          url: item.url,
          ...(alt ? { alt } : {}),
          ...(source ? { source } : {}),
          ...(framing ? { framing } : {}),
          ...(overlays ? { overlays } : {}),
        },
      ];
    }
    return [
      {
        type: "video",
        url: item.url,
        poster: typeof item.poster === "string" && item.poster ? item.poster : null,
        duration_s: typeof item.duration_s === "number" ? item.duration_s : null,
        framing: parseFraming(item.framing),
        overlays: parseOverlays(item.overlays),
      },
    ];
  });
}

// Photos et vidéos d'une publication, dans l'ordre. Anciennes publications (media vide) : la vidéo, puis les photos.
export function postMedia(
  post: Pick<PostRow, "media" | "image_urls" | "video_url" | "video_poster_url" | "video_duration_s">
): MediaItem[] {
  const media = parseMedia(post.media);
  if (media.length > 0) return media;
  const legacy: MediaItem[] = [];
  if (post.video_url) {
    legacy.push({ type: "video", url: post.video_url, poster: post.video_poster_url ?? null, duration_s: post.video_duration_s ?? null });
  }
  for (const url of post.image_urls ?? []) if (url) legacy.push({ type: "image", url });
  return legacy;
}

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

// Publications d'une personne (posts + vidéos), telles que la base me laisse les voir ; 0 en cas d'erreur
export async function fetchPostCount(supabase: SupabaseClient, authorId: string): Promise<number> {
  const { count, error } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", authorId);
  if (error) {
    console.error(`Comptage des publications impossible : ${error.message} (code ${error.code})`);
    return 0;
  }
  return count ?? 0;
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
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
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
export function drawScaled(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
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

// JPEG à la qualité donnée, réencodé un peu plus fort s'il dépasse la limite de l'espace de stockage (5 Mo)
async function encodeJpeg(canvas: HTMLCanvasElement, startQuality: number): Promise<Blob> {
  let quality = startQuality;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > IMAGE_MAX_BYTES && quality > 0.6) {
    quality -= 0.08;
    blob = await canvasToJpeg(canvas, quality);
  }
  return blob;
}

export async function compressPostImage(file: Blob): Promise<Blob> {
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = drawScaled(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    return await encodeJpeg(canvas, IMAGE_QUALITY);
  } finally {
    bitmap.close();
  }
}

// Photo recadrée au format 4:5 depuis l'ORIGINAL (orientation EXIF respectée) : 1638 × 2048 au maximum, jamais
// agrandie au-delà de la résolution d'origine, JPEG 0,88 (lib/framing.ts)
// overlay : dessin supplémentaire par-dessus (texte de l'éditeur), à la taille réelle du cadre W × H
export async function renderFramedPhoto(
  original: Blob,
  framing: Framing,
  overlay?: (ctx: CanvasRenderingContext2D, W: number, H: number) => Promise<void>
): Promise<Blob> {
  const bitmap = await decodeImage(original);
  try {
    return await renderFramedImage(bitmap, framing, { drawScaled, encode: encodeJpeg, overlay });
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

export async function removeVideoPaths(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(VIDEO_BUCKET).remove(paths);
  if (error) console.error(`Suppression des vidéos impossible : ${error.message}`);
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
  await removeFiles(supabase, postFiles(post));
  return true;
}

// ---------- Fichiers d'une publication (Storage) ----------

export type PostFiles = { images: string[]; videos: string[] }; // chemins dans les espaces « posts » et « videos »

// Fichiers de photos / vidéos (photos, photos de base, affiches, vidéos), doublons retirés
export function mediaFiles(media: MediaItem[]): PostFiles {
  const images = new Set<string>();
  const videos = new Set<string>();
  for (const m of media) {
    for (const url of m.type === "image" ? [m.url, m.source] : [m.poster]) {
      const path = storagePath(url, POST_BUCKET);
      if (path) images.add(path);
    }
    if (m.type === "video") {
      const path = storagePath(m.url, VIDEO_BUCKET);
      if (path) videos.add(path);
    }
  }
  return { images: [...images], videos: [...videos] };
}

// Tous les fichiers d'une publication : ceux de media et ceux des anciennes colonnes
export function postFiles(post: PostRow): PostFiles {
  const fromMedia = mediaFiles(postMedia(post));
  const images = new Set(fromMedia.images);
  const videos = new Set(fromMedia.videos);
  for (const url of [...(post.image_urls ?? []), post.video_poster_url]) {
    const path = storagePath(url, POST_BUCKET);
    if (path) images.add(path);
  }
  const video = storagePath(post.video_url, VIDEO_BUCKET);
  if (video) videos.add(video);
  return { images: [...images], videos: [...videos] };
}

// Fichiers de before qui ne sont plus dans after (à supprimer après une modification réussie)
export function removedFiles(before: PostFiles, after: PostFiles): PostFiles {
  const keepImages = new Set(after.images);
  const keepVideos = new Set(after.videos);
  return { images: before.images.filter((p) => !keepImages.has(p)), videos: before.videos.filter((p) => !keepVideos.has(p)) };
}

export async function removeFiles(supabase: SupabaseClient, files: PostFiles): Promise<void> {
  await Promise.all([removePostImages(supabase, files.images), removeVideoPaths(supabase, files.videos)]);
}
