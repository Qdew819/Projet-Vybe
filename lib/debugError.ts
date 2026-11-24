// TEMP-DEBUG : tout ce fichier est temporaire (affichage des erreurs réelles sur l'accueil en production).
// À retirer avec les lignes marquées « TEMP-DEBUG » une fois le problème trouvé.

type Detailed = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; cause?: unknown };

// « message · code 42501 · details … · hint … » ; pour une exception JavaScript, son message (et celui de sa cause)
export function errorDetails(err: unknown): string {
  if (err === null || err === undefined) return "erreur inconnue";
  if (typeof err !== "object") return String(err);
  const e = err as Detailed;
  // Erreur Supabase enveloppée dans une Error : on montre l'erreur d'origine
  if (e.cause && typeof e.cause === "object") return errorDetails(e.cause);
  const parts = [
    e.message ? String(e.message) : "",
    e.code ? `code ${String(e.code)}` : "",
    e.details ? `details : ${String(e.details)}` : "",
    e.hint ? `hint : ${String(e.hint)}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : String(err);
}
