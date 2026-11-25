import type { SupabaseClient } from "@supabase/supabase-js";
import type { Framing } from "./framing";
import {
  POST_BUCKET,
  VIDEO_BUCKET,
  loadPostStats,
  removePostImages,
  removeVideoPaths,
  storagePath,
  uploadPostImage,
  type MediaItem,
  type PostRow,
  type PostStats,
} from "./posts";
import { loadPeople, type Person } from "./follows";

// Vidéos des publications : espace de stockage public « videos » (un dossier par personne, 50 Mo, mp4 / webm / quicktime).
// L'affiche (image d'aperçu) va dans l'espace « posts », à côté des photos.
// Colonnes posts.video_url, posts.video_poster_url, posts.video_duration_s ; vues : table post_views, record_post_view(p_post).

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 30;
const POSTER_MAX_WIDTH = 720;
const POSTER_AT_SECONDS = 0.5;
const READ_TIMEOUT_MS = 15000;

const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const TYPES_BY_EXTENSION: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

// Type MIME réel du fichier (certains téléphones n'en donnent pas : on le déduit de l'extension)
export function videoContentType(file: File): string | null {
  if (EXTENSIONS[file.type]) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_EXTENSION[extension] ?? null;
}

// « 0:15 », « 1:02 »
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---------- Lecture de la vidéo choisie (durée, dimensions, affiche) ----------

export type VideoReadError = "unreadable";
export type VideoInfo = { duration: number; width: number; height: number; poster: Blob | null };

function waitFor(video: HTMLVideoElement, event: string, timeout = READ_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("unreadable"));
    };
    const timer = setTimeout(fail, timeout);
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
    }
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

// Image à ~0,5 s, largeur 720 px au maximum, JPEG qualité 0,8 (null si le navigateur refuse : la vidéo reste publiable)
async function capturePoster(video: HTMLVideoElement): Promise<Blob | null> {
  try {
    if (video.readyState < 2) await waitFor(video, "loadeddata");
    const target = Math.min(POSTER_AT_SECONDS, video.duration / 2);
    if (Math.abs(video.currentTime - target) > 0.01) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = target;
      await seeked;
    }
    const scale = Math.min(1, POSTER_MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch (err) {
    console.error("Capture de l'affiche impossible :", err);
    return null;
  }
}

// Lit la vidéo avec un élément <video> temporaire. Rejette avec « unreadable » si le navigateur ne sait pas la lire.
export async function readVideo(file: File): Promise<VideoInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const metadata = waitFor(video, "loadedmetadata");
    video.src = url;
    await metadata;
    // Certains WebM n'annoncent pas leur durée : on la fait calculer en allant tout au bout
    if (!Number.isFinite(video.duration)) {
      const changed = waitFor(video, "durationchange");
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await changed;
      video.currentTime = 0;
    }
    // Image de 0 × 0 : le son se lit mais pas l'image (ex. HEVC sur un navigateur qui ne le décode pas)
    if (!Number.isFinite(video.duration) || video.videoWidth === 0 || video.videoHeight === 0) throw new Error("unreadable");
    const poster = await capturePoster(video);
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, poster };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// ---------- Envoi ----------

// Envoie la vidéo dans videos/<userId>/<id>.<ext> avec une barre de progression (URL d'envoi signée + XMLHttpRequest)
export async function uploadVideo(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  file: File,
  onProgress: (fraction: number) => void
): Promise<{ path: string; url: string }> {
  const contentType = videoContentType(file) ?? "video/mp4";
  const path = `${userId}/${id}.${EXTENSIONS[contentType]}`;
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("URL d'envoi indisponible");
  const { data: session } = await supabase.auth.getSession();
  const apiKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || "";

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    if (apiKey) xhr.setRequestHeader("apikey", apiKey);
    if (session.session?.access_token) xhr.setRequestHeader("authorization", `Bearer ${session.session.access_token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envoi de la vidéo refusé (${xhr.status}) : ${xhr.responseText}`));
    xhr.onerror = () => reject(new Error("Envoi de la vidéo interrompu (réseau)"));
    xhr.send(file);
  });
  onProgress(1);
  return { path, url: supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl };
}

// Affiche dans posts/<userId>/<id>-poster.jpg
export async function uploadPoster(supabase: SupabaseClient, userId: string, id: string, blob: Blob): Promise<{ path: string; url: string }> {
  const path = `${userId}/${id}-poster.jpg`;
  const { error } = await supabase.storage.from(POST_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  return { path, url: supabase.storage.from(POST_BUCKET).getPublicUrl(path).data.publicUrl };
}

// ---------- Envoi de tous les éléments d'une publication ----------

// Envois simultanés au moment de publier
const MEDIA_UPLOAD_CONCURRENCY = 3;

export type MediaDraft =
  | { kind: "image"; blob: Blob }
  | { kind: "video"; file: File; duration: number; poster: Blob | null; framing?: Framing | null };

// Envoie photos et vidéos (avec leur affiche), 3 à la fois, en gardant l'ordre choisi. onProgress(éléments terminés).
// Si un seul envoi échoue : plus aucun nouvel envoi, tout ce qui a déjà été envoyé est supprimé et l'erreur est
// relancée. La publication n'est donc jamais créée à moitié.
export async function uploadPostMedia(
  supabase: SupabaseClient,
  userId: string,
  drafts: MediaDraft[],
  onProgress?: (done: number) => void
): Promise<MediaItem[]> {
  const results: (MediaItem | undefined)[] = new Array(drafts.length);
  const imagePaths: string[] = [];
  const videoPaths: string[] = [];
  let next = 0;
  let done = 0;
  let failure: unknown = null;

  async function send(draft: MediaDraft): Promise<MediaItem> {
    if (draft.kind === "image") {
      const image = await uploadPostImage(supabase, userId, draft.blob);
      imagePaths.push(image.path);
      return { type: "image", url: image.url };
    }
    const id = crypto.randomUUID();
    const video = await uploadVideo(supabase, userId, id, draft.file, () => undefined);
    videoPaths.push(video.path);
    let poster: string | null = null;
    if (draft.poster) {
      const uploaded = await uploadPoster(supabase, userId, id, draft.poster);
      imagePaths.push(uploaded.path);
      poster = uploaded.url;
    }
    return {
      type: "video",
      url: video.url,
      poster,
      duration_s: Math.min(VIDEO_MAX_SECONDS, Math.max(1, Math.round(draft.duration))),
      // Cadrage enregistré seulement s'il a été modifié dans l'éditeur (sinon affichage habituel)
      ...(draft.framing ? { framing: draft.framing } : {}),
    };
  }

  async function worker() {
    while (failure === null && next < drafts.length) {
      const index = next++;
      try {
        results[index] = await send(drafts[index]);
        done += 1;
        onProgress?.(done);
      } catch (err) {
        if (failure === null) failure = err;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MEDIA_UPLOAD_CONCURRENCY, drafts.length) }, worker));
  if (failure !== null) {
    await Promise.all([removePostImages(supabase, imagePaths), removeVideoPaths(supabase, videoPaths)]);
    throw failure;
  }
  return results as MediaItem[];
}

// Supprime les fichiers d'éléments déjà envoyés (publication finalement refusée par la base)
export async function removeMediaFiles(supabase: SupabaseClient, media: MediaItem[]): Promise<void> {
  const images = media.flatMap((m) => storagePath(m.type === "image" ? m.url : m.poster, POST_BUCKET) ?? []);
  const videos = media.flatMap((m) => (m.type === "video" ? (storagePath(m.url, VIDEO_BUCKET) ?? []) : []));
  await Promise.all([removePostImages(supabase, images), removeVideoPaths(supabase, videos)]);
}

// Colonnes de compatibilité écrites avec posts.media : photos dans l'ordre, PREMIÈRE vidéo (null s'il n'y en a pas)
export function legacyColumns(media: MediaItem[]) {
  const first = media.find((m) => m.type === "video");
  return {
    image_urls: media.filter((m) => m.type === "image").map((m) => m.url),
    video_url: first?.url ?? null,
    video_poster_url: first?.poster ?? null,
    video_duration_s: first?.duration_s ?? null,
  };
}

// ---------- Vues ----------

const VIEWED_KEY = "vybe.viewedPosts";

function viewedPosts(): string[] {
  try {
    const list: unknown = JSON.parse(window.sessionStorage.getItem(VIEWED_KEY) ?? "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

// Une seule vue par publication et par session ; les erreurs sont ignorées
export function recordView(supabase: SupabaseClient, postId: string): void {
  const viewed = viewedPosts();
  if (viewed.includes(postId)) return;
  try {
    window.sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...viewed, postId].slice(-500)));
  } catch {
    // Stockage indisponible : la vue est comptée quand même (une fois par lecteur)
  }
  void supabase.rpc("record_post_view", { p_post: postId }).then(
    () => undefined,
    () => undefined
  );
}

// ---------- Vidéos populaires (accueil) ----------

export const POPULAR_VIDEOS_LIMIT = 12;

export type PopularVideos = { posts: PostRow[]; people: Map<string, Person>; stats: Map<string, PostStats> };

export async function fetchPopularVideos(supabase: SupabaseClient, sport: string | null): Promise<PopularVideos> {
  const { data, error } = await supabase.rpc("popular_videos", { max_results: POPULAR_VIDEOS_LIMIT, p_sport: sport });
  if (error) throw new Error(`Lecture des vidéos populaires impossible : ${error.message} (code ${error.code})`);
  const posts = ((data ?? []) as PostRow[]).filter((p) => p.video_url);
  const [people, stats] = await Promise.all([
    loadPeople(supabase, [...new Set(posts.map((p) => p.author_id))]).catch((err: unknown) => {
      console.error("Lecture des auteurs impossible :", err);
      return [] as Person[];
    }),
    loadPostStats(supabase, posts.map((p) => p.id)),
  ]);
  return { posts, people: new Map(people.map((p) => [p.id, p])), stats };
}
