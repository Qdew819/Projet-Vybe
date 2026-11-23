// Règles du profil partagées entre la création du profil et les paramètres
export const BIO_MAX = 160;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
// Lettres minuscules sans accent, chiffres, points et tirets bas
const USERNAME_PATTERN = /^[a-z0-9._]+$/;

// Pendant la frappe : les majuscules deviennent des minuscules et les espaces sont retirés
export function normalizeUsername(value: string): string {
  return value.toLowerCase().replace(/\s/g, "");
}

export function isValidUsername(value: string): boolean {
  return value.length >= USERNAME_MIN && value.length <= USERNAME_MAX && USERNAME_PATTERN.test(value);
}

// Nom affiché : prénom et nom de l'inscription, sinon le nom Google (vide si aucun des deux)
export function displayNameFromMetadata(meta: Record<string, unknown>): string {
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const google = meta.full_name ?? meta.name;
  if (first) return [first, last].filter(Boolean).join(" ");
  return typeof google === "string" ? google.trim() : "";
}

// Initiales pour une photo de profil absente : « Quentin Dewa » → « QD », « alex99 » → « A »
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// Code Postgres d'une valeur déjà utilisée (nom d'utilisateur unique)
export const UNIQUE_VIOLATION = "23505";
