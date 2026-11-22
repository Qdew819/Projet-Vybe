"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, getSavedTheme } from "../lib/theme";

// Applique le thème choisi sur toutes les pages (l'écran d'accueil "/" reste sombre)
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const update = () => applyTheme(pathname === "/" ? "dark" : getSavedTheme());
    update();

    // En mode auto, suit l'appareil quand il passe de clair à sombre
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [pathname]);

  return children;
}
