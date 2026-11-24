"use client";

import { useEffect } from "react";
import BirthDateGate from "../components/BirthDateGate";
import { applyTheme, getSavedTheme } from "../lib/theme";

// Applique le thème choisi sur toutes les pages (l'écran d'accueil "/" reste sombre).
// On lit l'adresse dans useEffect plutôt qu'avec usePathname() : sinon Next.js exige un
// <Suspense> autour des pages dynamiques comme /u/[username].
// Ce template se remonte quand on change de section (/ → /connexion, /accueil → /u/…),
// donc l'effet s'exécute de nouveau à chaque fois. Entre deux pages d'une même section
// (ex. /u/a → /u/b), le thème reste de toute façon le même.
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const update = () => applyTheme(window.location.pathname === "/" ? "dark" : getSavedTheme());
    update();

    // En mode auto, suit l'appareil quand il passe de clair à sombre
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <>
      {/* Compte sans date de naissance → « Complète ton profil » (voir components/BirthDateGate.tsx) */}
      <BirthDateGate />
      {children}
    </>
  );
}
