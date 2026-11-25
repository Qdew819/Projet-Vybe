// Image envoyée pour les suggestions de musique (recherche par image d'Epidemic Sound, par notre serveur) :
// photo telle qu'elle sera publiée (déjà recadrée si elle a été modifiée), ou image du milieu d'une vidéo.
// Réduite à 512 px au plus, JPEG qualité 0,7. Rien n'est enregistré : l'image sert seulement à cet appel.

const MAX_SIDE = 512;
const QUALITY = 0.7;
const TIMEOUT_MS = 8000;

export type SuggestionSource = { kind: "image"; blob?: Blob | null; url: string } | { kind: "video"; url: string };

function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", QUALITY);
    } catch {
      resolve(null); // canvas « sali » par une image d'un autre domaine sans CORS
    }
  });
}

async function fromImage(blob: Blob | null | undefined, url: string): Promise<Blob | null> {
  const data = blob ?? (await fetch(url, { mode: "cors" }).then((r) => (r.ok ? r.blob() : null)));
  if (!data) return null;
  const bitmap = await createImageBitmap(data, { imageOrientation: "from-image" }).catch(() => createImageBitmap(data));
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function fromVideo(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    video.crossOrigin = "anonymous"; // vidéos déjà en ligne (Storage Supabase, CORS) : sinon le canvas serait bloqué
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => finish(null), { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        // Image du milieu de la vidéo
        video.currentTime = Number.isFinite(video.duration) && video.duration > 0 ? video.duration / 2 : 0;
      },
      { once: true }
    );
    video.addEventListener(
      "seeked",
      () => {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        void toJpeg(video, video.videoWidth, video.videoHeight).then(finish, () => finish(null));
      },
      { once: true }
    );
    video.src = url;
  });
}

export async function captureSuggestionImage(source: SuggestionSource): Promise<Blob | null> {
  try {
    return source.kind === "image" ? await fromImage(source.blob, source.url) : await fromVideo(source.url);
  } catch {
    return null;
  }
}
