import type { SupabaseClient } from "@supabase/supabase-js";

// Photo de fond du profil : espace de stockage Supabase « covers », un dossier par personne
export const COVER_BUCKET = "covers";
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
export const COVER_MAX_BYTES = 10 * 1024 * 1024; // 10 Mo avant redimensionnement
const COVER_WIDTH = 1500;
const COVER_HEIGHT = 500; // format 3:1

export function isAcceptedCover(file: Blob): boolean {
  return COVER_ACCEPT.split(",").includes(file.type);
}

// Recadre l'image au centre en 3:1 et la réduit à 1500 × 500, en JPEG
export async function resizeCover(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = COVER_WIDTH / COVER_HEIGHT;
  // Plus grand rectangle 3:1 qui tient dans l'image, pris au centre
  let sw = bitmap.width;
  let sh = sw / ratio;
  if (sh > bitmap.height) {
    sh = bitmap.height;
    sw = sh * ratio;
  }
  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");
  // Fond blanc : les zones transparentes d'un PNG ne deviennent pas noires en JPEG
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))), "image/jpeg", 0.85);
  });
}

// Envoie la photo de fond (elle remplace l'ancienne) et renvoie son adresse publique
export async function uploadCover(supabase: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/cover.jpg`;
  const { error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  // Le numéro de version force le navigateur à afficher la nouvelle photo et pas l'ancienne en cache
  return `${data.publicUrl}?v=${Date.now()}`;
}
