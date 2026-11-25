"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import Image from "next/image";
import { useT } from "../lib/i18n";

// Carrousel de photos façon Instagram : une photo à la fois, pleine largeur, ratio 4:5, on glisse sur le côté.
// Défilement natif avec scroll-snap : fluide au doigt et au pavé tactile, sans bloquer le défilement vertical de la page.
// Plusieurs photos : points sous l'image, compteur « 1/3 » en haut à droite, flèches au survol (ordinateur seulement)
// et flèches gauche/droite du clavier quand le carrousel (ou une de ses photos) a le focus.
// Rien n'est lu dans window/document pendant le rendu : la photo active est calculée au défilement.

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Au-delà de ce déplacement (px) entre l'appui et le relâchement, c'est un glissement : pas de clic
const DRAG_THRESHOLD = 10;

export default function ImageCarousel({
  images,
  onOpen,
  openLabel,
  overlay,
  sizes = "(max-width: 768px) 100vw, 600px",
  className = "",
}: {
  images: string[];
  onOpen?: (index: number) => void; // clic / toucher simple sur une photo
  openLabel?: string; // nom du bouton de chaque photo ({n} et {total} remplacés)
  overlay?: (index: number) => ReactNode; // contenu ajouté sur chaque photo (ex. bouton « × » de /publier)
  sizes?: string;
  className?: string;
}) {
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; scroll: number } | null>(null);
  const [rawActive, setRawActive] = useState(0);

  const count = images.length;
  const multiple = count > 1;
  // Une photo retirée (formulaire) peut laisser l'index au-delà de la dernière
  const active = Math.min(rawActive, Math.max(0, count - 1));

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    setRawActive(Math.round(scroller.scrollLeft / scroller.clientWidth));
  }

  function goTo(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = Math.max(0, Math.min(index, count - 1));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: target * scroller.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!multiple || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    goTo(active + (e.key === "ArrowRight" ? 1 : -1));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: e.clientX, y: e.clientY, scroll: scrollerRef.current?.scrollLeft ?? 0 };
  }

  // Un glissement (doigt, souris ou défilement pendant l'appui) n'ouvre pas la photo
  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || e.detail === 0) return; // clavier (Entrée, Espace) : toujours un vrai clic
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const scrolled = Math.abs((scrollerRef.current?.scrollLeft ?? 0) - start.scroll);
    if (moved > DRAG_THRESHOLD || scrolled > DRAG_THRESHOLD) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (count === 0) return null;

  const alt = (index: number) => t("carousel.photoOf").replace("{n}", String(index + 1)).replace("{total}", String(count));
  const arrow =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white md:flex";

  return (
    <div className={className}>
      <div
        role={multiple ? "group" : undefined}
        aria-roledescription={multiple ? t("carousel.role") : undefined}
        aria-label={multiple ? t("carousel.label") : undefined}
        onKeyDown={onKeyDown}
        className="group relative overflow-hidden rounded-xl bg-line"
      >
        <div
          ref={scrollerRef}
          tabIndex={multiple && !onOpen ? 0 : undefined}
          onScroll={multiple ? onScroll : undefined}
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
          className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, index) => {
            // Photo d'origine servie telle quelle (unoptimized : pas de réencodage par Next, donc pas de perte) ;
            // fill + object-cover remplit le cadre 4:5 sans étirer l'image. quality ne sert que si l'optimisation
            // de Next est un jour activée pour Supabase (images.remotePatterns dans next.config.ts).
            const picture = (
              <Image src={src} alt={alt(index)} fill unoptimized quality={85} sizes={sizes} draggable={false} className="object-cover" />
            );
            return (
              <div key={`${index}-${src}`} className="relative h-full w-full shrink-0 snap-center snap-always">
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(index)}
                    aria-label={openLabel?.replace("{n}", String(index + 1)).replace("{total}", String(count))}
                    className="absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
                  >
                    {picture}
                  </button>
                ) : (
                  picture
                )}
                {overlay?.(index)}
              </div>
            );
          })}
        </div>

        {multiple && (
          <>
            <p aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
              {active + 1}/{count}
            </p>
            {active > 0 && (
              <button type="button" onClick={() => goTo(active - 1)} aria-label={t("post.previousPhoto")} className={`${arrow} left-2`}>
                <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            {active < count - 1 && (
              <button type="button" onClick={() => goTo(active + 1)} aria-label={t("post.nextPhoto")} className={`${arrow} right-2`}>
                <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {multiple && (
        <div className="mt-2 flex justify-center gap-1.5" aria-live="polite">
          <span className="sr-only">{alt(active)}</span>
          {images.map((src, index) => (
            <span
              key={`${index}-${src}`}
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full transition-colors ${index === active ? "bg-[#39ff14]" : "bg-muted"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
