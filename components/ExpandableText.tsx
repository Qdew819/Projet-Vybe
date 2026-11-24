"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";

// Fond sous le bouton « Montrer plus » (posé sur la fin de la 3e ligne) : celui du bloc qui contient le texte
const BACKDROPS = {
  surface: { solid: "bg-surface", fade: "from-transparent to-surface" },
  background: { solid: "bg-background", fade: "from-transparent to-background" },
} as const;

// Texte coupé à 3 lignes, comme sur Instagram : « Montrer plus » n'apparaît que si le texte dépasse vraiment
// (mesuré après le montage et à chaque redimensionnement), puis « Montrer moins » pour le replier.
// Les sauts de ligne sont gardés ; les mots longs (liens) passent à la ligne sans être coupés au milieu d'un mot ordinaire.
export default function ExpandableText({
  text,
  className = "",
  backdrop = "surface",
}: {
  text: string;
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
  }, [text]);

  function toggle() {
    expandedRef.current = !expanded;
    setExpanded(!expanded);
  }

  const { solid, fade } = BACKDROPS[backdrop];
  const button = "cursor-pointer bg-transparent font-semibold text-muted hover:text-foreground focus-visible:rounded focus-visible:outline-2 focus-visible:outline-accent-ink";

  return (
    <div className={`relative ${className}`}>
      <p ref={ref} className={`whitespace-pre-line break-words ${expanded ? "" : "line-clamp-3"}`}>
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
