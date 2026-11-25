"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import TextOverlayLayer from "../TextOverlayLayer";
import { useT, type MessageKey } from "../../lib/i18n";
import { DEFAULT_FRAMING, FRAME_RATIO, MAX_SCALE, MIN_SCALE, clampFraming, framedMediaStyle, type Framing } from "../../lib/framing";
import { TEXT_FONTS } from "../../lib/textFonts";
import {
  MAX_TEXT_BLOCKS,
  MAX_TEXT_LENGTH,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  TEXT_COLORS,
  newTextBlock,
  type TextAlign,
  type TextBlock,
  type TextFontId,
  type TextStyleId,
} from "../../lib/textOverlay";

export type EditorMedia =
  | { kind: "image"; src: string; aspect: number | null }
  | { kind: "video"; src: string; poster: string | null; aspect: number | null };

type Point = { x: number; y: number };
type TextGesture = { id: string; mode: "move" | "handle"; base: TextBlock; points: Point[]; rect: DOMRect; start: Point; moved: boolean };

const RELEASE_MS = 200;
const SNAP = 0.015; // repère magnétique : à moins de 1,5 % du centre
const DOUBLE_TAP_MS = 300;

const FONT_LABELS: Record<TextFontId, MessageKey> = {
  normal: "editor.fontNormal",
  bold: "editor.fontBold",
  hand: "editor.fontHand",
  mono: "editor.fontMono",
};
const STYLE_LABELS: Record<TextStyleId, MessageKey> = { none: "editor.styleNone", fill: "editor.styleFill", outline: "editor.styleOutline" };
const ALIGN_LABELS: Record<TextAlign, MessageKey> = { left: "editor.alignLeft", center: "editor.alignCenter", right: "editor.alignRight" };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Éditeur plein écran (fond noir) pour une photo ou une vidéo : recadrage dans le cadre 4:5 et texte par-dessus.
// Recadrage : un doigt / la souris déplace, deux doigts / molette / curseur zooment (1× à 4×) ; « Remplir » se recale
// au relâchement (jamais de vide), « Ajuster » montre le média entier (fond noir ou flou) ; grille des tiers.
// Texte (« Aa », 10 blocs, 120 caractères) : glisser pour déplacer, deux doigts pour agrandir et tourner (poignées aux
// coins sur ordinateur), double-tap pour modifier, glisser sur la poubelle pour supprimer ; repères verts au centre.
// Ne fabrique rien : renvoie le cadrage et les textes (onDone) ; /publier génère la photo ou les enregistre (vidéo).
export default function MediaEditor({
  media,
  initial,
  initialTexts = [],
  frameRatio = FRAME_RATIO,
  busy = false,
  onCancel,
  onDone,
}: {
  media: EditorMedia;
  initial: Framing | null;
  initialTexts?: TextBlock[];
  frameRatio?: number; // cadre largeur / hauteur : 4:5 (posts) ou 9:16 (vidéos verticales)
  busy?: boolean;
  onCancel: () => void;
  onDone: (framing: Framing, texts: TextBlock[]) => void;
}) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [aspect, setAspect] = useState<number | null>(media.aspect);
  // Cadrage par défaut dans le cadre demandé (le format est enregistré avec le cadrage)
  const startFraming: Framing = frameRatio === FRAME_RATIO ? DEFAULT_FRAMING : { ...DEFAULT_FRAMING, frame: frameRatio };
  const [framing, setFraming] = useState<Framing>(initial ? { ...initial, ...(frameRatio === FRAME_RATIO ? {} : { frame: frameRatio }) } : startFraming);
  const [interacting, setInteracting] = useState(false);
  const [texts, setTexts] = useState<TextBlock[]>(initialTexts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [textDragging, setTextDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ framing: Framing; points: Point[]; rect: DOMRect } | null>(null);
  const textPointers = useRef(new Map<number, Point>());
  const textGesture = useRef<TextGesture | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const framingRef = useRef(framing);
  const textsRef = useRef(texts);
  useEffect(() => {
    framingRef.current = framing;
  }, [framing]);
  useEffect(() => {
    textsRef.current = texts;
  }, [texts]);

  // Pas de défilement de la page derrière tant que l'éditeur est ouvert ; Échap = Annuler (ou fin de la saisie).
  // Une seule fois à l'ouverture (onCancel est lu par une référence : sinon l'effet se relancerait à chaque rendu).
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  const editingRef = useRef(editingId);
  useEffect(() => {
    editingRef.current = editingId;
  }, [editingId]);
  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingRef.current) textareaRef.current?.blur();
      else cancelRef.current();
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

  // Molette (ordinateur) : zoom du média ; écouteur natif non passif pour empêcher le défilement de la page
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (textGesture.current) return;
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

  // ---------- Texte ----------

  const updateText = useCallback((id: string, patch: Partial<TextBlock>) => {
    setTexts((list) => list.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }, []);

  // Ouvre la saisie ; le champ est toujours présent et reçoit le focus PENDANT le geste (clavier sur iPhone)
  function startEditing(id: string) {
    setSelectedId(id);
    setEditingId(id);
    const field = textareaRef.current;
    if (field) {
      field.value = textsRef.current.find((block) => block.id === id)?.text ?? "";
      field.focus();
    }
  }

  function addText() {
    if (textsRef.current.length >= MAX_TEXT_BLOCKS) return;
    const block = newTextBlock(crypto.randomUUID());
    textsRef.current = [...textsRef.current, block];
    setTexts(textsRef.current);
    startEditing(block.id);
  }

  function finishEditing() {
    const id = editingRef.current;
    if (!id) return;
    const block = textsRef.current.find((b) => b.id === id);
    if (block && !block.text.trim()) {
      setTexts((list) => list.filter((b) => b.id !== id));
      setSelectedId(null);
    }
    setEditingId(null);
  }

  function removeText(id: string) {
    setTexts((list) => list.filter((block) => block.id !== id));
    setSelectedId(null);
    setEditingId(null);
  }

  function restartTextGesture(rect: DOMRect) {
    const current = textGesture.current;
    if (!current) return;
    const base = textsRef.current.find((block) => block.id === current.id) ?? current.base;
    textGesture.current = { ...current, base, points: [...textPointers.current.values()], rect };
  }

  // ---------- Gestes dans le cadre (média ou texte) ----------

  function restartGesture() {
    const frame = frameRef.current;
    if (!frame) return;
    gesture.current = { framing: framingRef.current, points: [...pointers.current.values()], rect: frame.getBoundingClientRect() };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || editingId) return;
    const frame = frameRef.current;
    if (!frame) return;
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-text-handle]");
    const blockEl = target.closest<HTMLElement>("[data-text-id]");
    const point = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);

    // Texte : doigt posé sur un bloc ou une poignée, ou 2e doigt pendant un geste sur un bloc
    if (handle || blockEl || textGesture.current) {
      textPointers.current.set(e.pointerId, point);
      const rect = frame.getBoundingClientRect();
      if (!textGesture.current) {
        const id = handle?.dataset.textHandle ?? blockEl?.dataset.textId ?? "";
        const base = textsRef.current.find((block) => block.id === id);
        if (!base) return;
        textGesture.current = { id, mode: handle ? "handle" : "move", base, points: [point], rect, start: point, moved: false };
        setSelectedId(id);
      } else {
        restartTextGesture(rect);
      }
      return;
    }

    // Média : déplacer / zoomer ; un toucher hors des textes les désélectionne
    setSelectedId(null);
    pointers.current.set(e.pointerId, point);
    setInteracting(true);
    restartGesture();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const point = { x: e.clientX, y: e.clientY };
    if (textPointers.current.has(e.pointerId) && textGesture.current) {
      textPointers.current.set(e.pointerId, point);
      moveText(point);
      return;
    }
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, point);
    const { framing: base, points: start, rect } = gesture.current;
    const now = [...pointers.current.values()];
    const toPct = (p: Point) => ({ x: ((p.x - rect.left) / rect.width - 0.5) * 100, y: ((p.y - rect.top) / rect.height - 0.5) * 100 });
    if (now.length === 1 && start.length >= 1) {
      const dx = ((now[0].x - start[0].x) / rect.width) * 100;
      const dy = ((now[0].y - start[0].y) / rect.height) * 100;
      setFraming({ ...base, x: base.x + dx, y: base.y + dy });
    } else if (now.length >= 2 && start.length >= 2) {
      const startMid = toPct(mid(start[0], start[1]));
      const nowMid = toPct(mid(now[0], now[1]));
      const zoomed = zoomAround(base, base.scale * (dist(now[0], now[1]) / Math.max(1, dist(start[0], start[1]))), startMid);
      setFraming({ ...zoomed, x: zoomed.x + (nowMid.x - startMid.x), y: zoomed.y + (nowMid.y - startMid.y) });
    }
  }

  function moveText(latest: Point) {
    const g = textGesture.current;
    if (!g) return;
    const { base, points: start, rect } = g;
    const now = [...textPointers.current.values()];
    if (!g.moved && dist(latest, g.start) > 6) {
      g.moved = true;
      if (g.mode === "move") setTextDragging(true);
    }
    const clampSize = (size: number) => Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, size));

    if (g.mode === "handle" && now.length === 1) {
      // Poignée (ordinateur) : distance et angle depuis le centre du bloc
      const center = { x: rect.left + base.x * rect.width, y: rect.top + base.y * rect.height };
      const ratio = dist(center, now[0]) / Math.max(1, dist(center, start[0]));
      updateText(g.id, { size: clampSize(base.size * ratio), rotation: base.rotation + angle(center, now[0]) - angle(center, start[0]) });
      return;
    }
    if (now.length >= 2 && start.length >= 2) {
      // Deux doigts : agrandir / réduire, tourner, et suivre le point entre les doigts
      const ratio = dist(now[0], now[1]) / Math.max(1, dist(start[0], start[1]));
      const m0 = mid(start[0], start[1]);
      const m1 = mid(now[0], now[1]);
      updateText(g.id, {
        size: clampSize(base.size * ratio),
        rotation: base.rotation + angle(now[0], now[1]) - angle(start[0], start[1]),
        x: base.x + (m1.x - m0.x) / rect.width,
        y: base.y + (m1.y - m0.y) / rect.height,
      });
      setGuides({ x: false, y: false });
      return;
    }
    if (now.length === 1 && start.length >= 1) {
      // Un doigt : déplacer, avec repères magnétiques au centre et poubelle en bas
      let x = base.x + (now[0].x - start[0].x) / rect.width;
      let y = base.y + (now[0].y - start[0].y) / rect.height;
      const snapX = Math.abs(x - 0.5) < SNAP;
      const snapY = Math.abs(y - 0.5) < SNAP;
      if (snapX) x = 0.5;
      if (snapY) y = 0.5;
      setGuides((current) => (current.x === snapX && current.y === snapY ? current : { x: snapX, y: snapY }));
      const trash = trashRef.current?.getBoundingClientRect();
      const over = Boolean(trash && now[0].x >= trash.left - 16 && now[0].x <= trash.right + 16 && now[0].y >= trash.top - 16 && now[0].y <= trash.bottom + 16);
      setOverTrash((current) => (current === over ? current : over));
      updateText(g.id, { x, y });
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (textPointers.current.has(e.pointerId)) {
      textPointers.current.delete(e.pointerId);
      const g = textGesture.current;
      if (textPointers.current.size === 0 && g) {
        textGesture.current = null;
        setGuides({ x: false, y: false });
        setTextDragging(false);
        if (overTrash && g.mode === "move") {
          removeText(g.id);
        } else if (!g.moved && g.mode === "move") {
          // Double-tap : modifier le texte
          const now = Date.now();
          if (lastTap.current && lastTap.current.id === g.id && now - lastTap.current.at < DOUBLE_TAP_MS) {
            lastTap.current = null;
            startEditing(g.id);
          } else {
            lastTap.current = { id: g.id, at: now };
          }
        }
        setOverTrash(false);
      } else if (frameRef.current) {
        restartTextGesture(frameRef.current.getBoundingClientRect());
      }
      return;
    }
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
  const selected = texts.find((block) => block.id === selectedId) ?? null;
  const editing = texts.find((block) => block.id === editingId) ?? null;
  const toggle = (on: boolean) =>
    `min-h-10 flex-1 rounded-full px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
      on ? "bg-[#39ff14] text-black" : "text-white/80 hover:text-white"
    }`;
  const chip = (on: boolean) =>
    `min-h-10 shrink-0 rounded-full border-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
      on ? "border-[#39ff14] text-[#39ff14]" : "border-white/25 text-white hover:border-white/60"
    }`;
  const handleClass =
    "absolute hidden h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#39ff14] [@media(pointer:fine)]:flex";

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
          onClick={() => aspect && onDone({ ...clampFraming(framing, aspect), aspect }, texts.filter((block) => block.text.trim()))}
          disabled={busy || !aspect || Boolean(editingId)}
          aria-busy={busy}
          className="min-h-11 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy ? t("editor.processing") : t("editor.done")}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {/* Cadre 4:5 aussi grand que possible ; touch-action none : les gestes ne font pas défiler la page */}
        <div
          ref={frameRef}
          aria-label={t("editor.frameLabel")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{ aspectRatio: frameRatio, width: `min(100%, calc((100dvh - 17rem) * ${frameRatio}), 480px)` }}
          className="relative cursor-grab touch-none select-none overflow-hidden bg-black active:cursor-grabbing"
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

          {/* Textes : même composant que l'affichage des publications */}
          <TextOverlayLayer
            blocks={texts}
            interactive
            selectedId={editingId ? null : selectedId}
            renderHandles={(block) => (
              <>
                <span data-text-handle={block.id} aria-hidden="true" className={`${handleClass} -left-3 -top-3`} />
                <span data-text-handle={block.id} aria-hidden="true" className={`${handleClass} -bottom-3 -right-3`} />
              </>
            )}
          />

          {/* Repères magnétiques (centre) */}
          {guides.x && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-0.5 -translate-x-1/2 bg-[#39ff14]" />}
          {guides.y && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 z-[2] h-0.5 -translate-y-1/2 bg-[#39ff14]" />}

          {/* Grille des tiers pendant le geste sur le média */}
          {interacting && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] border border-white/60">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
            </div>
          )}
        </div>

        {/* Poubelle : visible pendant qu'on déplace un texte */}
        <div
          ref={trashRef}
          aria-hidden={!textDragging}
          className={`pointer-events-none absolute bottom-2 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-2 transition-all ${
            textDragging ? "opacity-100" : "opacity-0"
          } ${overTrash ? "scale-125 border-[#ff3b30] bg-[#ff3b30] text-white" : "border-white/60 bg-black/60 text-white"}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
          <span className="sr-only">{t("editor.trash")}</span>
        </div>

        {/* Saisie du texte : champ toujours présent (focus possible pendant le geste, clavier sur iPhone) */}
        <div
          className={editing ? "absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-6" : "pointer-events-none fixed -left-[9999px] top-0 opacity-0"}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) textareaRef.current?.blur();
          }}
        >
          <label htmlFor="editeur-texte" className="sr-only">
            {t("editor.textLabel")}
          </label>
          <textarea
            id="editeur-texte"
            ref={textareaRef}
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            defaultValue=""
            onChange={(e) => editingId && updateText(editingId, { text: e.target.value.slice(0, MAX_TEXT_LENGTH) })}
            onBlur={finishEditing}
            style={
              editing
                ? {
                    fontFamily: TEXT_FONTS[editing.font].family,
                    fontWeight: TEXT_FONTS[editing.font].weight,
                    color: editing.style === "fill" ? undefined : editing.color,
                    textAlign: editing.align,
                  }
                : undefined
            }
            className="w-full resize-none bg-transparent text-center text-3xl leading-tight outline-none placeholder:text-white/50"
            placeholder={t("editor.textPlaceholder")}
          />
          {editing && (
            <span className="absolute bottom-3 right-6 text-xs font-semibold tabular-nums text-white/70">
              {editing.text.length}/{MAX_TEXT_LENGTH}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {selected || editing ? (
          // ---------- Outils du texte sélectionné ----------
          (() => {
            const block = (editing ?? selected)!;
            return (
              <>
                <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div role="radiogroup" aria-label={t("editor.font")} className="flex w-max gap-2">
                    {(Object.keys(TEXT_FONTS) as TextFontId[]).map((font) => (
                      <button
                        key={font}
                        type="button"
                        role="radio"
                        aria-checked={block.font === font}
                        aria-label={t(FONT_LABELS[font])}
                        onPointerDown={(e) => e.preventDefault()} // garde le clavier ouvert pendant la saisie
                        onClick={() => updateText(block.id, { font })}
                        style={{ fontFamily: TEXT_FONTS[font].family, fontWeight: TEXT_FONTS[font].weight }}
                        className={chip(block.font === font)}
                      >
                        {t(FONT_LABELS[font])}
                      </button>
                    ))}
                  </div>
                </div>
                <div role="radiogroup" aria-label={t("editor.color")} className="flex items-center justify-between gap-1">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={block.color === color}
                      aria-label={color}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => updateText(block.id, { color })}
                      style={{ background: color }}
                      className={`h-9 w-9 shrink-0 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        block.color === color ? "scale-110 border-white ring-2 ring-[#39ff14]" : "border-white/40"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <div role="radiogroup" aria-label={t("editor.textStyle")} className="flex flex-1 gap-1 rounded-full bg-white/10 p-1">
                    {(["none", "fill", "outline"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={block.style === value}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => updateText(block.id, { style: value })}
                        className={toggle(block.style === value)}
                      >
                        {t(STYLE_LABELS[value])}
                      </button>
                    ))}
                  </div>
                  <div role="radiogroup" aria-label={t("editor.align")} className="flex gap-1 rounded-full bg-white/10 p-1">
                    {(["left", "center", "right"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={block.align === value}
                        aria-label={t(ALIGN_LABELS[value])}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => updateText(block.id, { align: value })}
                        className={`flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white ${
                          block.align === value ? "bg-[#39ff14] text-black" : "text-white/80"
                        }`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                          {value === "left" && <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />}
                          {value === "center" && <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />}
                          {value === "right" && <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />}
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => removeText(block.id)}
                    className="min-h-11 flex-1 rounded-full border-2 border-[#ff3b30]/70 text-sm font-bold text-[#ff6b61] focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {t("editor.deleteText")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) textareaRef.current?.blur();
                      setSelectedId(null);
                    }}
                    className="min-h-11 flex-1 rounded-full bg-white text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {t("editor.textOk")}
                  </button>
                </div>
              </>
            );
          })()
        ) : (
          // ---------- Outils du recadrage ----------
          <>
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addText}
                disabled={busy || texts.length >= MAX_TEXT_BLOCKS}
                aria-label={t("editor.addText")}
                title={texts.length >= MAX_TEXT_BLOCKS ? t("editor.textMax").replace("{n}", String(MAX_TEXT_BLOCKS)) : t("editor.addText")}
                className="min-h-11 rounded-full border-2 border-[#39ff14] px-5 text-base font-black text-[#39ff14] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setFraming(startFraming)}
                disabled={busy}
                className="min-h-11 flex-1 rounded-full border-2 border-white/30 text-sm font-bold hover:border-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
              >
                {t("editor.reset")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
