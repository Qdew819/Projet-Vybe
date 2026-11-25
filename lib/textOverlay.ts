import type { CSSProperties } from "react";
import type { TextBlock } from "./overlayData";
import { TEXT_FONTS, loadTextFonts } from "./textFonts";

// Texte posé sur une photo dans l'éditeur de /publier, puis dessiné dans l'image finale (canvas).
// Tout est relatif au CADRE 4:5 (indépendant du recadrage et de la taille d'écran) :
// - x, y : centre du bloc, en fraction de la largeur et de la hauteur du cadre (0 à 1) ;
// - size : taille de police en fraction de la largeur du cadre ; rotation en radians.
// L'aperçu (textBlockStyle, en unités cqw du cadre) et le canvas (drawTextBlocks) utilisent les mêmes règles
// (interligne, marges, contour, ligne de base calculée comme en CSS) : le rendu final est le même que l'aperçu.

export * from "./overlayData";

const LINE_HEIGHT = 1.2; // × taille de police
const PAD_X = 0.35; // em
const PAD_Y = 0.18; // em
const RADIUS = 0.3; // em (fond plein)
const STROKE = 0.12; // em (contour, dessiné sous le remplissage)

// Couleur lisible par-dessus une couleur donnée (texte sur fond plein, contour)
export function contrastColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#ffffff";
}

// Style HTML d'un bloc (aperçu), dans un cadre en container-type: inline-size
export function textBlockStyle(block: TextBlock): CSSProperties {
  const font = TEXT_FONTS[block.font];
  const fill = block.style === "fill";
  return {
    position: "absolute",
    left: `${block.x * 100}%`,
    top: `${block.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${block.rotation}rad)`,
    fontFamily: font.family,
    fontWeight: font.weight,
    fontSize: `${block.size * 100}cqw`,
    lineHeight: LINE_HEIGHT,
    padding: `${PAD_Y}em ${PAD_X}em`,
    borderRadius: fill ? `${RADIUS}em` : 0,
    background: fill ? block.color : "transparent",
    color: fill ? contrastColor(block.color) : block.color,
    whiteSpace: "pre",
    textAlign: block.align,
    WebkitTextStroke: block.style === "outline" ? `${STROKE}em ${contrastColor(block.color)}` : undefined,
    paintOrder: "stroke fill",
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Dessine les blocs dans le canvas de l'image finale (W × H = taille réelle du cadre), après chargement des polices
export async function drawTextBlocks(ctx: CanvasRenderingContext2D, blocks: TextBlock[], W: number, H: number): Promise<void> {
  const visible = blocks.filter((block) => block.text.trim());
  if (visible.length === 0) return;
  await loadTextFonts(visible.map((block) => block.font));

  for (const block of visible) {
    const font = TEXT_FONTS[block.font];
    const px = block.size * W;
    const lineHeight = px * LINE_HEIGHT;
    const lines = block.text.split("\n");
    ctx.save();
    ctx.font = `${font.weight} ${px}px ${font.family}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const widths = lines.map((line) => ctx.measureText(line).width);
    const metrics = ctx.measureText("Hg");
    // Ligne de base comme en CSS : zone de la police (ascendante + descendante) centrée dans la ligne
    const ascent = metrics.fontBoundingBoxAscent ?? px * 0.8;
    const descent = metrics.fontBoundingBoxDescent ?? px * 0.2;
    const contentW = Math.max(0, ...widths);
    const boxW = contentW + 2 * PAD_X * px;
    const boxH = lines.length * lineHeight + 2 * PAD_Y * px;

    ctx.translate(block.x * W, block.y * H);
    ctx.rotate(block.rotation);
    const left = -boxW / 2;
    const top = -boxH / 2;

    const fill = block.style === "fill";
    if (fill) {
      ctx.fillStyle = block.color;
      roundedRect(ctx, left, top, boxW, boxH, RADIUS * px);
      ctx.fill();
    }
    const textColor = fill ? contrastColor(block.color) : block.color;
    lines.forEach((line, i) => {
      const offset = block.align === "left" ? 0 : block.align === "right" ? contentW - widths[i] : (contentW - widths[i]) / 2;
      const x = left + PAD_X * px + offset;
      const y = top + PAD_Y * px + i * lineHeight + (lineHeight - (ascent + descent)) / 2 + ascent;
      if (block.style === "outline") {
        // Comme -webkit-text-stroke + paint-order: stroke fill (contour sous le remplissage)
        ctx.lineWidth = STROKE * px;
        ctx.lineJoin = "round";
        ctx.strokeStyle = contrastColor(block.color);
        ctx.strokeText(line, x, y);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(line, x, y);
    });
    ctx.restore();
  }
}
