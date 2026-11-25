"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";

// Classes écrites en entier pour que Tailwind les génère
const CLAMPS = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5" } as const;

// Couleur de « plus » selon le fond : gris sur les cartes, blanc atténué sur une vidéo (fil plein écran)
const TONES = {
  surface: "text-muted hover:text-foreground focus-visible:outline-accent-ink",
  background: "text-muted hover:text-foreground focus-visible:outline-accent-ink",
  video: "text-white/70 hover:text-white focus-visible:outline-white",
} as const;

// Pas de useLayoutEffect côté serveur (avertissement de React)
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Texte replié façon Instagram : « Nom texte… plus » sur `lines` lignes au total (2 par défaut).
// - Si le texte dépasse, il est coupé au bon nombre de caractères pour que « … plus » tienne À LA SUITE du dernier
//   mot visible, sur la dernière ligne (mesuré dans une copie invisible du paragraphe, à chaque changement de largeur).
// - Toucher « plus » ou le texte le déplie sur place ; pas de « Montrer moins ».
// - S'il tient dans les lignes prévues : ni « … » ni « plus ». Les retours à la ligne sont gardés.
// interactive = false (texte dans une carte qui est déjà un lien) : même rendu, sans dépliage.
export default function ExpandableText({
  text,
  lines = 2,
  prefix,
  className = "",
  backdrop = "surface",
  interactive = true,
  onExpandedChange,
}: {
  text: string;
  lines?: keyof typeof CLAMPS; // nombre de lignes au total quand le texte est replié (nom compris)
  prefix?: ReactNode; // affiché avant le texte, sur la même ligne (ex. nom de l'auteur en gras)
  className?: string; // taille, interligne, marge…
  backdrop?: keyof typeof TONES;
  interactive?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useT();
  const visibleRef = useRef<HTMLParagraphElement>(null);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const measureTextRef = useRef<HTMLSpanElement>(null);
  const measureMoreRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  // null : le texte tient (ou pas encore mesuré) ; sinon, la partie visible avant « … plus »
  const [cut, setCut] = useState<string | null>(null);
  const expandedRef = useRef(false);

  const measure = useCallback(() => {
    const copy = measureRef.current;
    const span = measureTextRef.current;
    const tail = measureMoreRef.current;
    const line = lineRef.current;
    if (!copy || !span || !tail || !line || expandedRef.current) return;
    // Hauteur permise : `lines` lignes (hauteur d'une ligne de référence, même police)
    const limit = line.getBoundingClientRect().height * lines;
    // 1. Le texte complet tient-il ? (sans « … plus »)
    tail.style.display = "none";
    span.textContent = text;
    const overflows = copy.scrollHeight > limit + 1;
    tail.style.display = "";
    if (!overflows) {
      setCut(null);
      return;
    }
    // 2. Plus longue coupe pour laquelle « texte… plus » tient dans la même hauteur (recherche par dichotomie)
    const fits = (n: number) => {
      span.textContent = `${text.slice(0, n).trimEnd()}…`;
      return copy.scrollHeight <= limit + 1;
    };
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(mid)) low = mid;
      else high = mid - 1;
    }
    // Pas de mot coupé en deux si on peut l'éviter (on recule jusqu'au dernier espace proche)
    let end = low;
    const space = text.slice(0, low).search(/\s\S*$/);
    if (space > 0 && low - space < 20 && low < text.length && !/\s/.test(text[low])) end = space;
    setCut(text.slice(0, end).trimEnd());
  }, [text, lines]);

  useIsoLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const element = measureRef.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  function expand() {
    if (!interactive || cut === null || expandedRef.current) return;
    expandedRef.current = true;
    setExpanded(true);
    onExpandedChange?.(true);
  }

  const tone = TONES[backdrop];
  const more = (
    <>
      {"… "}
      {interactive ? (
        <button
          type="button"
          aria-expanded={false}
          aria-label={t("text.showMore")}
          onClick={(e) => {
            e.stopPropagation();
            expand();
          }}
          className={`cursor-pointer bg-transparent p-0 font-semibold focus-visible:rounded focus-visible:outline-2 ${tone}`}
        >
          {t("text.more")}
        </button>
      ) : (
        <span className={`font-semibold ${tone}`}>{t("text.more")}</span>
      )}
    </>
  );
  const head = prefix ? (
    <>
      {prefix}{" "}
    </>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      {expanded || cut === null ? (
        // Déplié, ou tient dans les lignes prévues (avant la première mesure : coupé net, sans « plus »)
        <p ref={visibleRef} className={`whitespace-pre-line break-words ${expanded ? "" : CLAMPS[lines]}`}>
          {head}
          {text}
        </p>
      ) : (
        // Replié : « … plus » dans le flux, juste après le dernier mot visible
        <p
          ref={visibleRef}
          onClick={interactive ? expand : undefined}
          className={`whitespace-pre-line break-words ${interactive ? "cursor-pointer" : ""}`}
        >
          {head}
          {cut}
          {more}
        </p>
      )}
      {/* Copie invisible, même largeur et même style, pour mesurer où couper */}
      {!expanded && (
        <p ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-line break-words">
          {head}
          <span ref={measureTextRef} />
          <span ref={measureMoreRef}>
            {" "}
            <span className="font-semibold">{t("text.more")}</span>
          </span>
        </p>
      )}
      {/* Une ligne de référence (hauteur d'une ligne dans cette police) */}
      {!expanded && (
        <span ref={lineRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 block whitespace-nowrap">
          A
        </span>
      )}
    </div>
  );
}
