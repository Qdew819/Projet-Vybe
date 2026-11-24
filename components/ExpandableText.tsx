"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";

// Classes écrites en entier pour que Tailwind les génère
const CLAMPS = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5" } as const;

// Fond sous le bouton « Montrer plus » (posé sur la fin de la 3e ligne) : celui du bloc qui contient le texte
const BACKDROPS = {
  surface: { solid: "bg-surface", fade: "from-transparent to-surface" },
  background: { solid: "bg-background", fade: "from-transparent to-background" },
} as const;

// Texte coupé à 3 lignes (ou `lines`), comme sur Instagram : « Montrer plus » n'apparaît que si le texte dépasse vraiment
// (mesuré après le montage et à chaque redimensionnement), puis « Montrer moins » pour le replier.
// Les sauts de ligne sont gardés ; les mots longs (liens) passent à la ligne sans être coupés au milieu d'un mot ordinaire.
export default function ExpandableText({
  text,
  lines = 3,
  prefix,
  className = "",
  backdrop = "surface",
}: {
  text: string;
  lines?: keyof typeof CLAMPS; // nombre de lignes affichées quand le texte est replié
  prefix?: ReactNode; // affiché avant le texte, sur la même ligne (ex. nom de l'auteur en gras)
  className?: string; // taille, interligne, marge…
  backdrop?: keyof typeof BACKDROPS;
}) {
  const t = useT();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false); // false au premier rendu (serveur et hydratation)
  const expandedRef = useRef(false);

  // Mesure seulement quand le texte est replié (déployé, il n'y a plus rien à comparer)
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (!expandedRef.current) setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines]);

  function toggle() {
    expandedRef.current = !expanded;
    setExpanded(!expanded);
  }

  const { solid, fade } = BACKDROPS[backdrop];
  const button = "cursor-pointer bg-transparent font-semibold text-muted hover:text-foreground focus-visible:rounded focus-visible:outline-2 focus-visible:outline-accent-ink";

  return (
    <div className={`relative ${className}`}>
      <p ref={ref} className={`whitespace-pre-line break-words ${expanded ? "" : CLAMPS[lines]}`}>
        {prefix}
        {prefix ? " " : null}
        {text}
      </p>
      {overflows && !expanded && (
        // Sur la fin de la dernière ligne visible, avec un léger fondu pour ne pas couper un mot net
        <span className={`absolute bottom-0 right-0 flex ${solid}`}>
          <span aria-hidden="true" className={`absolute inset-y-0 right-full w-8 bg-linear-to-r ${fade}`} />
          <button type="button" aria-expanded={false} onClick={toggle} className={`pl-1 ${button}`}>
            {t("text.showMore")}
          </button>
        </span>
      )}
      {overflows && expanded && (
        <div className="flex justify-end">
          <button type="button" aria-expanded onClick={toggle} className={button}>
            {t("text.showLess")}
          </button>
        </div>
      )}
    </div>
  );
}
