"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "../lib/i18n";

// Carrousel de photos façon Instagram : une photo à la fois, pleine largeur, ratio 4:5, on glisse sur le côté.
// - Un doigt : seulement le glissement horizontal d'une photo complète à la suivante (scroll-snap natif). Le
//   défilement vertical est coupé dans le cadre (overflow-y hidden) et le rebond de Safari aussi (overscroll none) :
//   la photo ne peut plus bouger dans son cadre ni laisser voir le fond.
// - Deux doigts (téléphone, si zoomable) : la photo est copiée dans un calque fixe par-dessus la page, s'agrandit
//   autour du point entre les doigts (1× à 4×) et suit leur mouvement ; au relâchement elle revient en 200 ms.
//   Pendant le pincement, ni le carrousel ni la page ne défilent.
// - touch-action: pan-x pan-y : Safari ne zoome plus la page entière (double-tap ou pincement) sur la photo.
// - Ordinateur : pas de zoom (pas d'événements touch), flèches au survol et flèches du clavier.
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
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const RELEASE_MS = 200;
// Après un pincement, le clic que Safari peut encore envoyer est ignoré pendant ce délai
const CLICK_GUARD_MS = 500;

// Image non déplaçable : pas de glisser-déposer, pas de menu « Enregistrer l'image » au toucher long, pas de sélection
const imageClass = "select-none object-cover [-webkit-touch-callout:none] [-webkit-user-drag:none]";

type Point = { x: number; y: number };
type Zoom = {
  src: string;
  alt: string;
  rect: { left: number; top: number; width: number; height: number }; // position de la photo à l'écran
  origin: Point; // point entre les doigts au départ, relatif à la photo
  scale: number;
  dx: number;
  dy: number;
  releasing: boolean;
};

export default function ImageCarousel({
  images,
  onOpen,
  openLabel,
  overlay,
  zoomable = true,
  sizes = "(max-width: 768px) 100vw, 600px",
  className = "",
}: {
  images: string[];
  onOpen?: (index: number) => void; // clic / toucher simple sur une photo
  openLabel?: string; // nom du bouton de chaque photo ({n} et {total} remplacés)
  overlay?: (index: number) => ReactNode; // contenu ajouté sur chaque photo (ex. bouton « × » de /publier)
  zoomable?: boolean; // pincement à deux doigts (false dans l'aperçu de /publier)
  sizes?: string;
  className?: string;
}) {
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; scroll: number } | null>(null);
  const clickGuardUntil = useRef(0);
  const [rawActive, setRawActive] = useState(0);
  const [zoom, setZoom] = useState<Zoom | null>(null);

  const count = images.length;
  const multiple = count > 1;
  // Une photo retirée (formulaire) peut laisser l'index au-delà de la dernière
  const active = Math.min(rawActive, Math.max(0, count - 1));

  // Valeurs lues par les écouteurs natifs (installés une seule fois)
  const live = useRef({ images, active });
  useEffect(() => {
    live.current = { images, active };
  });

  const alt = (index: number) => t("carousel.photoOf").replace("{n}", String(index + 1)).replace("{total}", String(count));
  const altRef = useRef(alt);
  useEffect(() => {
    altRef.current = alt;
  });

  // ---------- Pincement (événements touch natifs, passive: false pour pouvoir bloquer le défilement) ----------
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !zoomable) return;

    let start: { distance: number; mid: Point; scrollLeft: number } | null = null;
    let pinching = false; // vrai du 2e doigt posé jusqu'au dernier doigt levé
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const middle = (a: Touch, b: Touch): Point => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 2 || pinching) return;
      const { images: list, active: index } = live.current;
      const slide = scroller!.querySelector<HTMLElement>(`[data-slide="${index}"]`);
      if (!slide || !list[index]) return;
      e.preventDefault();
      pinching = true;
      if (releaseTimer) clearTimeout(releaseTimer);
      // La photo reste celle qui était affichée, même si le 1er doigt avait commencé à glisser
      scroller!.scrollTo({ left: index * scroller!.clientWidth, behavior: "auto" });
      const box = slide.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const mid = middle(a, b);
      start = { distance: Math.max(1, distance(a, b)), mid, scrollLeft: index * scroller!.clientWidth };
      setZoom({
        src: list[index],
        alt: altRef.current(index),
        rect: { left: box.left, top: box.top, width: box.width, height: box.height },
        origin: { x: mid.x - box.left, y: mid.y - box.top },
        scale: 1,
        dx: 0,
        dy: 0,
        releasing: false,
      });
    }

    function onTouchMove(e: TouchEvent) {
      if (!pinching) return;
      // Pendant le pincement (et jusqu'au dernier doigt levé) : ni le carrousel ni la page ne bougent
      e.preventDefault();
      if (!start || e.touches.length < 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const mid = middle(a, b);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, distance(a, b) / start.distance));
      const dx = mid.x - start.mid.x;
      const dy = mid.y - start.mid.y;
      setZoom((current) => (current ? { ...current, scale, dx, dy } : current));
    }

    function onTouchEnd(e: TouchEvent) {
      if (!pinching) return;
      if (start && e.touches.length < 2) {
        // Retour en douceur à la taille et à la place d'origine, puis le calque disparaît
        const scrollLeft = start.scrollLeft;
        start = null;
        clickGuardUntil.current = Date.now() + CLICK_GUARD_MS;
        setZoom((current) => (current ? { ...current, scale: 1, dx: 0, dy: 0, releasing: true } : current));
        releaseTimer = setTimeout(() => setZoom(null), RELEASE_MS);
        scroller!.scrollTo({ left: scrollLeft, behavior: "auto" });
      }
      if (e.touches.length === 0) pinching = false;
    }

    // Safari (iOS) : empêche son propre zoom de la page quand le geste commence sur la photo
    const onGesture = (e: Event) => e.preventDefault();

    scroller.addEventListener("touchstart", onTouchStart, { passive: false });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    scroller.addEventListener("gesturestart", onGesture, { passive: false });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("gesturestart", onGesture);
      if (releaseTimer) clearTimeout(releaseTimer);
    };
  }, [zoomable]);

  // ---------- Défilement, flèches, clavier ----------

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0 || zoom) return;
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

  // Un glissement ou un pincement n'ouvre pas la photo
  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (e.detail === 0) return; // clavier (Entrée, Espace) : toujours un vrai clic
    const pinched = zoom !== null || Date.now() < clickGuardUntil.current;
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
    const scrolled = start ? Math.abs((scrollerRef.current?.scrollLeft ?? 0) - start.scroll) : 0;
    if (pinched || moved > DRAG_THRESHOLD || scrolled > DRAG_THRESHOLD) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (count === 0) return null;

  const arrow =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white md:flex";

  return (
    <div className={className}>
      <div
        role={multiple ? "group" : undefined}
        aria-roledescription={multiple ? t("carousel.role") : undefined}
        aria-label={multiple ? t("carousel.label") : undefined}
        onKeyDown={onKeyDown}
        className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-line"
      >
        <div
          ref={scrollerRef}
          tabIndex={multiple && !onOpen ? 0 : undefined}
          onScroll={multiple ? onScroll : undefined}
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
          // overflow-y hidden + overscroll none : un doigt ne peut que changer de photo (pas de rebond qui montre le fond)
          className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-none [scrollbar-width:none] [touch-action:pan-x_pan-y] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, index) => {
            // Photo d'origine servie telle quelle (unoptimized : pas de réencodage par Next, donc pas de perte) ;
            // fill = absolute inset-0 w-full h-full, object-cover remplit le cadre 4:5 sans étirer l'image
            const picture = (
              <Image src={src} alt={alt(index)} fill unoptimized quality={85} sizes={sizes} draggable={false} className={imageClass} />
            );
            return (
              <div
                key={`${index}-${src}`}
                data-slide={index}
                className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden"
              >
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(index)}
                    aria-label={openLabel?.replace("{n}", String(index + 1)).replace("{total}", String(count))}
                    className="absolute inset-0 block [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
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
          {visibleDots(count, active).map(({ index, small }) => (
            <span
              key={index}
              aria-hidden="true"
              className={`rounded-full transition-all duration-200 ${small ? "h-1 w-1" : "h-1.5 w-1.5"} ${
                index === active ? "bg-[#39ff14]" : "bg-muted"
              }`}
            />
          ))}
        </div>
      )}

      {/* Calque du pincement : seulement pendant le geste (jamais au premier rendu), par-dessus toute la page */}
      {zoom && createPortal(<ZoomLayer zoom={zoom} />, document.body)}
    </div>
  );
}

// Points sous la photo : tous jusqu'à 5 photos ; au-delà, une fenêtre de 5 points qui se décale avec la photo
// active (comme Instagram), les points du bord plus petits quand il reste des photos de ce côté-là
const MAX_DOTS = 5;
function visibleDots(count: number, active: number): { index: number; small: boolean }[] {
  if (count <= MAX_DOTS) return Array.from({ length: count }, (_, index) => ({ index, small: false }));
  const first = Math.max(0, Math.min(active - Math.floor(MAX_DOTS / 2), count - MAX_DOTS));
  const last = first + MAX_DOTS - 1;
  return Array.from({ length: MAX_DOTS }, (_, i) => {
    const index = first + i;
    const small = (index === first && first > 0) || (index === last && last < count - 1);
    return { index, small: small && index !== active };
  });
}

// Copie de la photo à sa position exacte à l'écran, agrandie autour du point entre les doigts et déplacée avec eux.
// Fond légèrement assombri derrière. Ne reçoit aucun toucher : les doigts restent liés à la photo d'origine.
function ZoomLayer({ zoom }: { zoom: Zoom }) {
  const transition = zoom.releasing ? `transform ${RELEASE_MS}ms ease-out, opacity ${RELEASE_MS}ms ease-out` : "none";
  const dim = zoom.releasing ? 0 : Math.min(0.6, 0.25 + (zoom.scale - 1) * 0.2);
  const photo: CSSProperties = {
    left: zoom.rect.left,
    top: zoom.rect.top,
    width: zoom.rect.width,
    height: zoom.rect.height,
    transformOrigin: `${zoom.origin.x}px ${zoom.origin.y}px`,
    transform: `translate3d(${zoom.dx}px, ${zoom.dy}px, 0) scale(${zoom.scale})`,
    transition,
    willChange: "transform",
  };
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black" style={{ opacity: dim, transition }} />
      <div className="fixed overflow-hidden" style={photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- copie temporaire de la photo déjà chargée */}
        <img src={zoom.src} alt={zoom.alt} draggable={false} className={`h-full w-full ${imageClass}`} />
      </div>
    </div>
  );
}
