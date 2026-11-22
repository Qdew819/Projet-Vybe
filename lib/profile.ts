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

// Code Postgres d'une valeur déjà utilisée (nom d'utilisateur unique)
export const UNIQUE_VIOLATION = "23505";
