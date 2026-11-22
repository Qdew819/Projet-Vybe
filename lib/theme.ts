// Choix d'affichage : clair, sombre ou auto (suit le réglage de l'appareil)
export type ThemeChoice = "light" | "dark" | "auto";

export const THEME_STORAGE_KEY = "vybe-theme";
export const DEFAULT_THEME: ThemeChoice = "dark";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "auto";
}

// Lit le choix sauvegardé sur cet appareil (sombre si rien n'est sauvegardé)
export function getSavedTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Navigation privée ou stockage bloqué : le thème s'applique quand même
  }
}

// Transforme "auto" en "light" ou "dark" selon l'appareil
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "auto") return choice;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Met les bonnes couleurs sur la page
export function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

// Sauvegarde et applique
export function setTheme(choice: ThemeChoice) {
  saveTheme(choice);
  applyTheme(choice);
}

// Script lancé avant l'affichage pour éviter un flash de la mauvaise couleur.
// L'écran d'accueil avec le stade ("/") reste toujours sombre.
export const themeInitScript = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(c!=="light"&&c!=="dark"&&c!=="auto")c=${JSON.stringify(
  DEFAULT_THEME
)};if(location.pathname==="/")c="dark";if(c==="auto")c=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=c}catch(e){}})();`;
