// Langue de l'application
export type Language = "fr" | "en";

export const LANGUAGE_STORAGE_KEY = "vybe-language";
export const DEFAULT_LANGUAGE: Language = "fr";

// Langues qu'on peut vraiment choisir. Retire une langue d'ici pour l'afficher « Bientôt ».
export const AVAILABLE_LANGUAGES: readonly Language[] = ["fr", "en"];

export function isLanguage(value: unknown): value is Language {
  return value === "fr" || value === "en";
}

export function isLanguageAvailable(language: Language): boolean {
  return AVAILABLE_LANGUAGES.includes(language);
}

// Garde la langue si elle est disponible, sinon revient au français
function availableOrDefault(language: Language): Language {
  return isLanguageAvailable(language) ? language : DEFAULT_LANGUAGE;
}

// Devine la langue de l'appareil (français si elle commence par "fr")
export function detectLanguage(): Language {
  try {
    const detected: Language = navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
    return availableOrDefault(detected);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// Lit le choix sauvegardé sur cet appareil, sinon la langue de l'appareil
export function getSavedLanguage(): Language {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(value)) return availableOrDefault(value);
  } catch {
    // Stockage bloqué : on se rabat sur la langue de l'appareil
  }
  return detectLanguage();
}

export function saveLanguage(language: Language) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Navigation privée ou stockage bloqué : la langue s'applique quand même
  }
}

// Indique la langue de la page (lecteurs d'écran, correcteur, traduction)
export function applyLanguage(language: Language) {
  document.documentElement.lang = language;
}

// Prévient les écrans ouverts quand la langue change, pour qu'ils se traduisent tout de suite
const listeners = new Set<() => void>();

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  // Changement fait dans un autre onglet
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANGUAGE_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// Sauvegarde, applique et met à jour les textes affichés
export function setLanguage(language: Language) {
  saveLanguage(language);
  applyLanguage(language);
  listeners.forEach((listener) => listener());
}

// Script lancé avant l'affichage pour mettre le bon attribut lang sur <html>
export const languageInitScript = `(function(){try{var l=localStorage.getItem(${JSON.stringify(
  LANGUAGE_STORAGE_KEY
)});if(l!=="fr"&&l!=="en")l=(navigator.language||"").toLowerCase().indexOf("fr")===0?"fr":"en";document.documentElement.lang=l}catch(e){}})();`;
