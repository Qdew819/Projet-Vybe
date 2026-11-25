"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../lib/i18n";
import { DEFAULT_FRAMING, MAX_SCALE, MIN_SCALE, clampFraming, framedMediaStyle, type Framing } from "../../lib/framing";

export type EditorMedia =
  | { kind: "image"; src: string; aspect: number | null }
  | { kind: "video"; src: string; poster: string | null; aspect: number | null };

type Point = { x: number; y: number };
const RELEASE_MS = 200;

// Éditeur plein écran (fond noir) pour recadrer une photo ou une vidéo dans le cadre 4:5 du carrousel.
// - un doigt / la souris : déplacer ; deux doigts, molette ou curseur « Zoom » : zoomer (1× à 4×) ;
// - « Remplir » : le média couvre tout le cadre et se recale tout seul au relâchement (jamais de vide) ;
//   « Ajuster » : le média entier est visible, bandes noires ou floues ;
// - grille des tiers pendant qu'on bouge ; « Réinitialiser » ; la page derrière ne défile pas.
// Ne fabrique rien lui-même : renvoie le cadrage (onDone), /publier génère la photo ou l'enregistre pour la vidéo.
export default function MediaEditor({
  media,
  initial,
  busy = false,
  onCancel,
  onDone,
}: {
  media: EditorMedia;
  initial: Framing | null;
  busy?: boolean;
  onCancel: () => void;
  onDone: (framing: Framing) => void;
}) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [aspect, setAspect] = useState<number | null>(media.aspect);
  const [framing, setFraming] = useState<Framing>(initial ?? DEFAULT_FRAMING);
  const [interacting, setInteracting] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ framing: Framing; points: Point[]; rect: DOMRect } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const framingRef = useRef(framing);
  useEffect(() => {
    framingRef.current = framing;
  }, [framing]);

  // Pas de défilement de la page derrière tant que l'éditeur est ouvert ; Échap = Annuler.
  // Une seule fois à l'ouverture (onCancel est lu par une référence : sinon l'effet se relancerait à chaque rendu).
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const settle = useCallback(() => {
    if (aspect) setFraming((current) => clampFraming(current, aspect));
  }, [aspect]);

  // Zoom autour d'un point (en % du cadre depuis son centre) : ce point reste sous le doigt / le curseur
  const zoomAround = useCallback((base: Framing, nextScale: number, at: Point): Framing => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const ratio = scale / base.scale;
    return { ...base, scale, x: at.x + (base.x - at.x) * ratio, y: at.y + (base.y - at.y) * ratio };
  }, []);

  // Molette (ordinateur) : zoom ; écouteur natif non passif pour empêcher le défilement de la page
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      const at = { x: ((e.clientX - rect.left) / rect.width - 0.5) * 100, y: ((e.clientY - rect.top) / rect.height - 0.5) * 100 };
      setInteracting(true);
      setFraming((current) => zoomAround(current, current.scale * Math.exp(-e.deltaY * 0.0015), at));
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        setInteracting(false);
        settle();
      }, 250);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      frame.removeEventListener("wheel", onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [zoomAround, settle]);

  // Nouveau point de départ du geste à chaque doigt posé ou levé
  function restartGesture() {
    const frame = frameRef.current;
    if (!frame) return;
    gesture.current = { framing: framingRef.current, points: [...pointers.current.values()], rect: frame.getBoundingClientRect() };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
    restartGesture();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { framing: base, points: start, rect } = gesture.current;
    const now = [...pointers.current.values()];
    const toPct = (p: Point) => ({ x: ((p.x - rect.left) / rect.width - 0.5) * 100, y: ((p.y - rect.top) / rect.height - 0.5) * 100 });
    if (now.length === 1 && start.length >= 1) {
      // Un doigt : déplacer
      const dx = ((now[0].x - start[0].x) / rect.width) * 100;
      const dy = ((now[0].y - start[0].y) / rect.height) * 100;
      setFraming({ ...base, x: base.x + dx, y: base.y + dy });
    } else if (now.length >= 2 && start.length >= 2) {
      // Deux doigts : zoomer autour du point entre les doigts, et suivre son déplacement
      const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
      const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const startMid = toPct(mid(start[0], start[1]));
      const nowMid = toPct(mid(now[0], now[1]));
      const zoomed = zoomAround(base, base.scale * (dist(now[0], now[1]) / Math.max(1, dist(start[0], start[1]))), startMid);
      setFraming({ ...zoomed, x: zoomed.x + (nowMid.x - startMid.x), y: zoomed.y + (nowMid.y - startMid.y) });
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setInteracting(false);
      settle(); // recalage (jamais de vide en « Remplir »)
    } else {
      restartGesture();
    }
  }

  const live = aspect ? framedMediaStyle(framing, aspect, !interacting) : undefined;
  const style = live && !interacting ? { ...live, transition: `left ${RELEASE_MS}ms ease-out, top ${RELEASE_MS}ms ease-out, transform ${RELEASE_MS}ms ease-out` } : live;
  const blurSource = media.kind === "image" ? media.src : media.poster;
  const toggle = (selected: boolean) =>
    `min-h-10 flex-1 rounded-full px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
      selected ? "bg-[#39ff14] text-black" : "text-white/80 hover:text-white"
    }`;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="editeur-titre" className="fixed inset-0 z-[1000] flex flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-full px-4 text-sm font-bold text-white/90 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
        >
          {t("common.cancel")}
        </button>
        <h2 id="editeur-titre" className="text-base font-bold">
          {t("editor.title")}
        </h2>
        <button
          ref={doneRef}
          type="button"
          onClick={() => aspect && onDone({ ...clampFraming(framing, aspect), aspect })}
          disabled={busy || !aspect}
          aria-busy={busy}
          className="min-h-11 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy ? t("editor.processing") : t("editor.done")}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        {/* Cadre 4:5 aussi grand que possible ; touch-action none : le geste ne fait pas défiler la page */}
        <div
          ref={frameRef}
          aria-label={t("editor.frameLabel")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="relative aspect-[4/5] w-[min(100%,calc((100dvh-15rem)*0.8),480px)] cursor-grab touch-none select-none overflow-hidden bg-black active:cursor-grabbing"
        >
          {framing.mode === "fit" && framing.background === "blur" && blurSource && (
            // eslint-disable-next-line @next/next/no-img-element -- fond flou temporaire (aperçu local)
            <img src={blurSource} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
          )}
          {media.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local déplacé et zoomé librement
            <img
              src={media.src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight);
              }}
              style={style ?? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              className="pointer-events-none [-webkit-user-drag:none]"
            />
          ) : (
            <video
              src={media.src}
              poster={media.poster ?? undefined}
              muted
              playsInline
              autoPlay
              loop
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
              }}
              style={style ?? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              className="pointer-events-none"
            />
          )}
          {/* Grille des tiers pendant le geste */}
          {interacting && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 border border-white/60">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <p className="text-center text-xs text-white/60">{t("editor.hint")}</p>
        <div role="radiogroup" aria-label={t("editor.mode")} className="flex gap-1 rounded-full bg-white/10 p-1">
          {(["fill", "fit"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={framing.mode === mode}
              disabled={busy}
              onClick={() => setFraming((current) => (current.mode === mode ? current : { ...current, mode, scale: 1, x: 0, y: 0 }))}
              className={toggle(framing.mode === mode)}
            >
              {mode === "fill" ? t("editor.fill") : t("editor.fit")}
            </button>
          ))}
        </div>
        {framing.mode === "fit" && (
          <div role="radiogroup" aria-label={t("editor.background")} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/70">{t("editor.background")}</span>
            <div className="flex flex-1 gap-1 rounded-full bg-white/10 p-1">
              {(["black", "blur"] as const).map((background) => (
                <button
                  key={background}
                  type="button"
                  role="radio"
                  aria-checked={framing.background === background}
                  disabled={busy}
                  onClick={() => setFraming((current) => ({ ...current, background }))}
                  className={toggle(framing.background === background)}
                >
                  {background === "black" ? t("editor.black") : t("editor.blur")}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <label htmlFor="editeur-zoom" className="text-xs font-semibold text-white/70">
            {t("editor.zoom")}
          </label>
          <input
            id="editeur-zoom"
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            value={framing.scale}
            disabled={busy}
            onChange={(e) => {
              const next = { ...framingRef.current, scale: Number(e.target.value) };
              setFraming(aspect ? clampFraming(next, aspect) : next);
            }}
            aria-valuetext={`${framing.scale.toFixed(1)}×`}
            className="h-11 flex-1 cursor-pointer accent-[#39ff14]"
          />
          <span className="w-10 text-right text-xs font-bold tabular-nums">{framing.scale.toFixed(1)}×</span>
        </div>
        <button
          type="button"
          onClick={() => setFraming(DEFAULT_FRAMING)}
          disabled={busy}
          className="min-h-11 rounded-full border-2 border-white/30 text-sm font-bold hover:border-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
        >
          {t("editor.reset")}
        </button>
      </div>
    </div>,
    document.body
  );
}
