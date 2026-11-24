import type { SupabaseClient } from "@supabase/supabase-js";
import { COVER_BUCKET } from "./cover";
import type { MessageKey } from "./i18n";

// Événements : tables public.events (infos publiques) et public.event_locations (adresse exacte, privée).
//
// Colonnes de events : id, organizer_id, title (3–80), description (≤ 1000), sport (slug du catalogue),
// starts_at (dans le futur), venue_name (2–80), city, country, capacity (null = illimité, sinon 2–500),
// min_age (16 ou 18), join_mode ('open' | 'approval'), visibility ('public' | 'followers'), cover_url,
// cancelled, created_at, level (null = tous niveaux, sinon un niveau de user_sports), notify_on_join.
//
// city : libellé de la ville sans le pays (« Saint-Jérôme, QC ») ; country : code du pays (« CA »),
// comme cities.country_code. C'est ce qui sert à trouver les événements près de la personne.

export const EVENT_TITLE_MIN = 3;
export const EVENT_TITLE_MAX = 80;
export const EVENT_VENUE_MIN = 2;
export const EVENT_VENUE_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 1000;
export const EVENT_ADDRESS_MAX = 200;
export const EVENT_CAPACITY_MIN = 2;
export const EVENT_CAPACITY_MAX = 500;
export const EVENT_CAPACITY_DEFAULT = 12;
export const EVENT_MIN_AGES = [16, 18] as const;
export type EventMinAge = (typeof EVENT_MIN_AGES)[number];

export type JoinMode = "open" | "approval";
export type Visibility = "public" | "followers";

// Message d'erreur à afficher quand l'enregistrement d'un événement échoue.
// Les fonctions et contraintes de la base renvoient des codes en français (« limite_evenements »…).
export function eventSaveErrorKey(error: { message?: string; code?: string; details?: string | null }): MessageKey {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (text.includes("limite_evenements")) return "eventForm.errorLimit";
  if (text.includes("date_passee")) return "eventForm.errorPast";
  if (error.code === "42501") return "eventForm.errorAuth";
  if (error.code === "23514") return "eventForm.errorInvalid";
  return "eventForm.errorGeneric";
}

// ---------- Photo de couverture ----------

export const EVENT_COVER_ACCEPT = "image/jpeg,image/png,image/webp";
export const EVENT_COVER_MAX_INPUT_BYTES = 15 * 1024 * 1024; // avant compression
const EVENT_COVER_MAX_BYTES = 1024 * 1024; // ~1 Mo après compression
const EVENT_COVER_WIDTH = 1280;
const EVENT_COVER_HEIGHT = 720; // 16:9

export function isAcceptedEventCover(file: Blob): boolean {
  return EVENT_COVER_ACCEPT.split(",").includes(file.type);
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))), "image/jpeg", quality);
  });
}

// Recadre au centre en 16:9, réduit à 1280 × 720 et baisse la qualité JPEG jusqu'à passer sous ~1 Mo
export async function compressEventCover(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = EVENT_COVER_WIDTH / EVENT_COVER_HEIGHT;
  let sw = bitmap.width;
  let sh = sw / ratio;
  if (sh > bitmap.height) {
    sh = bitmap.height;
    sw = sh * ratio;
  }
  // Pas d'agrandissement : une petite photo reste petite
  const scale = Math.min(1, EVENT_COVER_WIDTH / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");
  // Fond blanc : les zones transparentes d'un PNG ne deviennent pas noires en JPEG
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toJpeg(canvas, 0.85);
  for (const quality of [0.75, 0.65, 0.55, 0.45]) {
    if (blob.size <= EVENT_COVER_MAX_BYTES) break;
    blob = await toJpeg(canvas, quality);
  }
  return blob;
}

// Envoie la couverture dans covers/<userId>/events/ et renvoie son adresse publique
export async function uploadEventCover(supabase: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/events/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

// « 2026-11-29 » + « 19:00 » (heure de l'appareil) → Date, ou null si incomplet
export function combineDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

// Date du jour au format des champs <input type="date"> (heure de l'appareil)
export function todayInputValue(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
