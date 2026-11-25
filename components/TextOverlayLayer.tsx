"use client";

import type { ReactNode } from "react";
import { textBlockStyle, type TextBlock } from "../lib/textOverlay";

// Textes posés sur une photo ou une vidéo, en HTML/CSS par-dessus le média, dans le cadre 4:5.
// Le MÊME composant sert à l'aperçu de l'éditeur (interactive) et à l'affichage des publications : rendu identique.
// Les tailles sont en unités cqw du cadre (container-type: inline-size) : même rendu sur tous les écrans.
// Affichage : pointer-events none, les gestes du carrousel passent à travers.
export default function TextOverlayLayer({
  blocks,
  interactive = false,
  selectedId = null,
  renderHandles,
}: {
  blocks: TextBlock[];
  interactive?: boolean;
  selectedId?: string | null;
  renderHandles?: (block: TextBlock) => ReactNode;
}) {
  if (blocks.length === 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" style={{ containerType: "inline-size" }}>
      {blocks.map((block) => {
        if (!interactive && !block.text.trim()) return null;
        const selected = interactive && block.id === selectedId;
        return (
          <div
            key={block.id}
            data-text-id={interactive ? block.id : undefined}
            style={textBlockStyle(block)}
            className={
              interactive
                ? `pointer-events-auto cursor-move touch-none select-none ${selected ? "outline-2 outline-offset-4 outline-dashed outline-white/90" : ""}`
                : undefined
            }
          >
            {block.text || (interactive ? " " : "")}
            {selected && renderHandles?.(block)}
          </div>
        );
      })}
    </div>
  );
}
