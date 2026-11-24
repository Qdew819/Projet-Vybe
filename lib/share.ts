// Partage : adresses courtes et publiques, et retour après connexion.
// Les liens partagés s'ouvrent même sans compte : /e/<id> (événement), /p/<id> (publication), /u/<pseudo> (profil).

export function eventSharePath(id: string): string {
  return `/e/${encodeURIComponent(id)}`;
}
export function postSharePath(id: string): string {
  return `/p/${encodeURIComponent(id)}`;
}
export function profileSharePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}

// Adresse complète : NEXT_PUBLIC_SITE_URL si elle est définie, sinon l'adresse du site ouvert.
// À appeler seulement dans le navigateur (au clic), jamais pendant le premier rendu.
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
  return `${site}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

// ---------- Retour après connexion ----------

export const RETURN_PARAM = "retour";
export const RETURN_COOKIE = "vybe_retour"; // gardé pendant la connexion avec Google (10 minutes)

// N'accepte que des chemins internes (« /e/123 ») : pas d'adresse externe, ni « //site.com », ni « /\site.com »
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // Pas de caractères de contrôle ni de barre oblique inverse
  for (const char of value) {
    if (char === "\\" || char.charCodeAt(0) < 32) return null;
  }
  return value;
}

// /connexion avec le chemin où revenir une fois connecté
export function loginPathWithReturn(path: string): string {
  return `/connexion?${RETURN_PARAM}=${encodeURIComponent(path)}`;
}
