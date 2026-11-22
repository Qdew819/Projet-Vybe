import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "./i18n";

// Photo de profil : espace de stockage Supabase « avatars », un dossier par personne
export const AVATAR_BUCKET = "avatars";
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024; // 10 Mo avant redimensionnement
export const AVATAR_SIZE = 512; // photo enregistrée en carré de 512 × 512

// Avatars prêts à l'emploi (fichiers dans public/avatars) : rien à envoyer, on garde juste leur chemin
export const PRESET_AVATARS: { src: string; label: MessageKey }[] = [
  { src: "/avatars/hockey.svg", label: "avatar.hockey" },
  { src: "/avatars/soccer.svg", label: "avatar.soccer" },
  { src: "/avatars/basketball.svg", label: "avatar.basketball" },
  { src: "/avatars/tennis.svg", label: "avatar.tennis" },
  { src: "/avatars/volleyball.svg", label: "avatar.volleyball" },
  { src: "/avatars/baseball.svg", label: "avatar.baseball" },
  { src: "/avatars/football.svg", label: "avatar.football" },
  { src: "/avatars/pingpong.svg", label: "avatar.pingpong" },
];

// Vrai si l'adresse pointe vers une photo envoyée dans le stockage (et non un avatar prêt à l'emploi)
export function isStoredAvatar(url: string | null): boolean {
  return !!url && url.includes(`/storage/v1/object/public/${AVATAR_BUCKET}/`);
}

export function isAcceptedAvatar(file: Blob): boolean {
  return AVATAR_ACCEPT.split(",").includes(file.type);
}

// Recadre l'image au centre en carré et la réduit, pour envoyer un petit fichier JPEG
export async function resizeAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");
  // Fond blanc : les zones transparentes d'un PNG ne deviennent pas noires en JPEG
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))), "image/jpeg", 0.85);
  });
}

// Envoie la photo (elle remplace l'ancienne) et renvoie son adresse publique
export async function uploadAvatar(supabase: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Le numéro de version force le navigateur à afficher la nouvelle photo et pas l'ancienne en cache
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Supprime la photo stockée (quand la personne retire sa photo)
export async function deleteAvatar(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([`${userId}/avatar.jpg`]);
  if (error) throw error;
}
