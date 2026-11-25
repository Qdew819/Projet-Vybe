// Données des textes posés sur une photo ou une vidéo (éditeur de /publier). Sans police ni rendu : utilisable
// partout (lecture de posts.media). Le rendu est dans lib/textOverlay.ts et components/TextOverlayLayer.tsx.
//
// En mémoire (TextBlock) : x, y = centre du bloc en fraction du cadre (0 à 1) ; size = taille de police en fraction de
// la largeur du cadre ; rotation en radians.
// Dans posts.media (vidéos, MediaOverlay) : { text, font, color, style, align, x, y, scale, rotation } avec x et y en
// POURCENTAGE du cadre et scale = taille de police en fraction de la largeur du cadre : même rendu sur tous les écrans.

export type TextFontId = "normal" | "bold" | "hand" | "mono";
export type TextStyleId = "none" | "fill" | "outline";
export type TextAlign = "left" | "center" | "right";

export type TextBlock = {
  id: string;
  text: string;
  font: TextFontId;
  color: string;
  style: TextStyleId;
  align: TextAlign;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

export type MediaOverlay = {
  text: string;
  font: TextFontId;
  color: string;
  style: TextStyleId;
  align: TextAlign;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export const MAX_TEXT_BLOCKS = 10;
export const MAX_TEXT_LENGTH = 120;
export const TEXT_COLORS = ["#ffffff", "#000000", "#39ff14", "#ffd60a", "#ff3b30", "#0a84ff", "#ff5fa2"] as const;
export const MIN_TEXT_SIZE = 0.025;
export const MAX_TEXT_SIZE = 0.4;
export const DEFAULT_TEXT_SIZE = 0.08;

const FONTS: TextFontId[] = ["normal", "bold", "hand", "mono"];
const STYLES: TextStyleId[] = ["none", "fill", "outline"];
const ALIGNS: TextAlign[] = ["left", "center", "right"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function newTextBlock(id: string): TextBlock {
  return { id, text: "", font: "bold", color: "#ffffff", style: "none", align: "center", x: 0.5, y: 0.5, size: DEFAULT_TEXT_SIZE, rotation: 0 };
}

// Texte de l'image ou de la vidéo, pour alt / aria-label
export function textAlt(blocks: { text: string }[] | null | undefined): string {
  return (blocks ?? [])
    .map((block) => block.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

export function toOverlays(blocks: TextBlock[]): MediaOverlay[] {
  return blocks
    .filter((block) => block.text.trim())
    .slice(0, MAX_TEXT_BLOCKS)
    .map(({ text, font, color, style, align, x, y, size, rotation }) => ({
      text: text.slice(0, MAX_TEXT_LENGTH),
      font,
      color,
      style,
      align,
      x: Math.round(x * 10000) / 100,
      y: Math.round(y * 10000) / 100,
      scale: Math.round(size * 10000) / 10000,
      rotation: Math.round(rotation * 1000) / 1000,
    }));
}

export function fromOverlays(list: MediaOverlay[], idPrefix = "o"): TextBlock[] {
  return list.map((o, i) => ({
    id: `${idPrefix}-${i}`,
    text: o.text,
    font: o.font,
    color: o.color,
    style: o.style,
    align: o.align,
    x: o.x / 100,
    y: o.y / 100,
    size: o.scale,
    rotation: o.rotation,
  }));
}

// Lecture vérifiée depuis posts.media (valeurs inattendues ignorées) ; null s'il n'y a rien
export function parseOverlays(value: unknown): MediaOverlay[] | null {
  if (!Array.isArray(value)) return null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const list = value.slice(0, MAX_TEXT_BLOCKS).flatMap((raw): MediaOverlay[] => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.slice(0, MAX_TEXT_LENGTH) : "";
    if (!text.trim()) return [];
    return [
      {
        text,
        font: FONTS.includes(o.font as TextFontId) ? (o.font as TextFontId) : "bold",
        color: typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#ffffff",
        style: STYLES.includes(o.style as TextStyleId) ? (o.style as TextStyleId) : "none",
        align: ALIGNS.includes(o.align as TextAlign) ? (o.align as TextAlign) : "center",
        x: clamp(num(o.x, 50), -50, 150),
        y: clamp(num(o.y, 50), -50, 150),
        scale: clamp(num(o.scale, DEFAULT_TEXT_SIZE), MIN_TEXT_SIZE, MAX_TEXT_SIZE),
        rotation: clamp(num(o.rotation, 0), -100, 100),
      },
    ];
  });
  return list.length > 0 ? list : null;
}
