import { Caveat, Inter, Montserrat, Special_Elite } from "next/font/google";
import type { TextFontId } from "./overlayData";

export type { TextFontId };

// Polices du texte sur les photos (éditeur de /publier), chargées avec next/font (servies par notre site).
// family : la même chaîne sert au rendu HTML (aperçu) et au canvas (image finale).
const inter = Inter({ subsets: ["latin"], weight: ["600"], display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["800"], display: "swap", preload: false });
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], display: "swap", preload: false });
const specialElite = Special_Elite({ subsets: ["latin"], weight: ["400"], display: "swap", preload: false });


export const TEXT_FONTS: Record<TextFontId, { family: string; weight: number }> = {
  normal: { family: inter.style.fontFamily, weight: 600 },
  bold: { family: montserrat.style.fontFamily, weight: 800 }, // style Vybe
  hand: { family: caveat.style.fontFamily, weight: 700 }, // manuscrite
  mono: { family: specialElite.style.fontFamily, weight: 400 }, // machine à écrire
};

// À attendre avant de dessiner dans le canvas : sinon il utiliserait une police de remplacement
export async function loadTextFonts(ids: TextFontId[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([...new Set(ids)].map((id) => document.fonts.load(`${TEXT_FONTS[id].weight} 64px ${TEXT_FONTS[id].family}`)));
  await document.fonts.ready;
}
