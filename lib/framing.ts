import type { CSSProperties } from "react";

// Cadrage d'une photo ou d'une vidéo dans le cadre 4:5 du carrousel (éditeur de /publier).
// - mode « fill » (Remplir) : le média couvre tout le cadre (jamais de vide) ; « fit » (Ajuster) : il est entier,
//   avec des bandes de fond « black » (noir) ou « blur » (le média lui-même, flouté).
// - scale : zoom de 1 à 4 par rapport à la taille de base du mode.
// - x, y : décalage du centre du média par rapport au centre du cadre, en POURCENTAGE de la largeur (x) et de la
//   hauteur (y) du cadre : indépendant de la taille d'écran.
// - aspect : largeur / hauteur du média (champ en plus, pour afficher le cadrage dès le premier rendu, avant que la
//   vidéo ait chargé ses dimensions).
// Les PHOTOS sont recadrées une fois pour toutes (canvas, renderFramedImage). Les VIDÉOS ne sont pas réencodées :
// leur cadrage est enregistré dans posts.media[i].framing et appliqué à l'affichage (framedMediaStyle).

export type Framing = {
  mode: "fill" | "fit";
  scale: number;
  x: number;
  y: number;
  background: "black" | "blur";
  aspect?: number;
};

export const FRAME_RATIO = 4 / 5; // largeur / hauteur du cadre
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DEFAULT_FRAMING: Framing = { mode: "fill", scale: 1, x: 0, y: 0, background: "black" };

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Taille de base du média dans le cadre (fraction de la largeur et de la hauteur du cadre), avant le zoom
export function baseSize(mode: Framing["mode"], aspect: number): { w: number; h: number } {
  const wider = aspect > FRAME_RATIO;
  if (mode === "fill") return wider ? { w: aspect / FRAME_RATIO, h: 1 } : { w: 1, h: FRAME_RATIO / aspect };
  return wider ? { w: 1, h: FRAME_RATIO / aspect } : { w: aspect / FRAME_RATIO, h: 1 };
}

// Décalage maximum (en % du cadre) pour que le média ne laisse jamais de vide (Remplir) ou ne sorte pas du cadre
// (Ajuster, sans zoom)
export function clampFraming(framing: Framing, aspect: number): Framing {
  const scale = clampNumber(framing.scale, MIN_SCALE, MAX_SCALE);
  const { w, h } = baseSize(framing.mode, aspect);
  const maxX = (Math.abs(w * scale - 1) / 2) * 100;
  const maxY = (Math.abs(h * scale - 1) / 2) * 100;
  return { ...framing, scale, x: clampNumber(framing.x, -maxX, maxX), y: clampNumber(framing.y, -maxY, maxY) };
}

// Cadrage lu depuis posts.media (valeurs vérifiées) ; null si absent ou invalide (→ affichage habituel)
export function parseFraming(value: unknown): Framing | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  if (raw.mode !== "fill" && raw.mode !== "fit") return null;
  const aspect = num(raw.aspect, NaN);
  return {
    mode: raw.mode,
    scale: clampNumber(num(raw.scale, 1), MIN_SCALE, MAX_SCALE),
    x: clampNumber(num(raw.x, 0), -300, 300),
    y: clampNumber(num(raw.y, 0), -300, 300),
    background: raw.background === "blur" ? "blur" : "black",
    ...(Number.isFinite(aspect) && aspect > 0 ? { aspect } : {}),
  };
}

// Style de l'élément média (img / video) DANS un conteneur 4:5 en position relative et overflow-hidden.
// Tout est en pourcentage du conteneur : le même cadrage s'affiche pareil sur tous les écrans.
// clamp = false : pendant un glissement dans l'éditeur (le média se recale au relâchement)
export function framedMediaStyle(framing: Framing, aspect: number, clamp = true): CSSProperties {
  const f = clamp ? clampFraming(framing, aspect) : { ...framing, scale: clampNumber(framing.scale, MIN_SCALE, MAX_SCALE) };
  const { w, h } = baseSize(f.mode, aspect);
  return {
    position: "absolute",
    left: `calc(50% + ${f.x}%)`,
    top: `calc(50% + ${f.y}%)`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
    maxWidth: "none",
    transform: `translate(-50%, -50%) scale(${f.scale})`,
    transformOrigin: "center",
    objectFit: "cover",
  };
}

// ---------- Photo finale (canvas) ----------

const OUTPUT_MAX_WIDTH = 1638; // 1638 × 2048 au maximum
const OUTPUT_QUALITY = 0.88;

// Fond flou dessiné sans ctx.filter (absent des anciens Safari) : réduction à quelques pixels puis agrandissement lissé
function drawBlurredBackground(ctx: CanvasRenderingContext2D, source: CanvasImageSource, srcW: number, srcH: number, W: number, H: number) {
  const tiny = document.createElement("canvas");
  const coverScale = Math.max(W / srcW, H / srcH);
  tiny.width = 24;
  tiny.height = Math.max(1, Math.round((24 * H) / W));
  const t = tiny.getContext("2d");
  if (!t) return;
  const tw = srcW * coverScale * (tiny.width / W);
  const th = srcH * coverScale * (tiny.width / W);
  t.drawImage(source, (tiny.width - tw) / 2, (tiny.height - th) / 2, tw, th);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tiny, 0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, W, H);
}

// Photo recadrée au format 4:5 : 1638 × 2048 au plus, jamais plus que la résolution d'origine dans la zone visible.
// decode : image décodée avec son orientation EXIF ; drawScaled : réduction de bonne qualité ; encode : JPEG 0,88.
export async function renderFramedImage(
  bitmap: ImageBitmap,
  framing: Framing,
  helpers: {
    drawScaled: (bitmap: ImageBitmap, width: number, height: number) => HTMLCanvasElement;
    encode: (canvas: HTMLCanvasElement, quality: number) => Promise<Blob>;
    overlay?: (ctx: CanvasRenderingContext2D, W: number, H: number) => Promise<void>;
  }
): Promise<Blob> {
  const aspect = bitmap.width / bitmap.height;
  const f = clampFraming(framing, aspect);
  const { w, h } = baseSize(f.mode, aspect);
  // Largeur du cadre telle que le média ne soit jamais agrandi : (w × scale × W) ≤ largeur d'origine
  const W = Math.max(1, Math.min(OUTPUT_MAX_WIDTH, Math.floor(bitmap.width / (w * f.scale))));
  const H = Math.round(W / FRAME_RATIO);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  if (f.mode === "fit" && f.background === "blur") drawBlurredBackground(ctx, bitmap, bitmap.width, bitmap.height, W, H);

  const mw = Math.max(1, Math.round(w * f.scale * W));
  const mh = Math.max(1, Math.round(h * f.scale * H));
  const scaled = helpers.drawScaled(bitmap, Math.min(mw, bitmap.width), Math.min(mh, bitmap.height));
  const cx = W / 2 + (f.x / 100) * W;
  const cy = H / 2 + (f.y / 100) * H;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scaled, cx - mw / 2, cy - mh / 2, mw, mh);
  // Texte : dessiné à la résolution réelle de l'image finale (net, même mise en page que l'aperçu)
  if (helpers.overlay) await helpers.overlay(ctx, W, H);
  return helpers.encode(canvas, OUTPUT_QUALITY);
}
