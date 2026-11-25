import type { SupabaseClient } from "@supabase/supabase-js";

// Date de naissance : table public.private_profiles (id = id de la personne, birth_date).
// Chacun ne lit et n'écrit que sa propre ligne ; get_age() la lit pour les événements (âge minimum).
// Elle n'est jamais enregistrée dans public.profiles (table lisible par les autres).

export const MIN_AGE = 14; // âge minimum pour utiliser Vybe (politique de confidentialité, section 2)
export const ADULT_AGE = 18; // en dessous, le compte passe en privé

// Date du jour au format AAAA-MM-JJ (heure locale)
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Âge en années complètes à partir d'une date AAAA-MM-JJ, ou null si la date est vide, invalide ou dans le futur
export function ageFrom(birthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Refuse les dates qui n'existent pas (31 février…)
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayPassed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

// Ma date de naissance enregistrée (AAAA-MM-JJ), null si je n'en ai pas ; lève une erreur si la lecture échoue
export async function fetchMyBirthDate(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("private_profiles").select("birth_date").eq("id", userId).maybeSingle();
  if (error) throw new Error(`Lecture de la date de naissance impossible : ${error.message} (code ${error.code})`);
  return typeof data?.birth_date === "string" && data.birth_date ? data.birth_date : null;
}

// Enregistre la date de naissance. Avec makeMinorPrivate (par défaut), moins de 18 ans → compte privé, comme le
// choix proposé à l'inscription. La création du profil passe false : son propre choix « public / privé » s'applique.
// Renvoie null si tout est enregistré, sinon la description de l'erreur (pour la console).
export async function saveBirthDate(
  supabase: SupabaseClient,
  userId: string,
  birthDate: string,
  makeMinorPrivate = true
): Promise<string | null> {
  const { error } = await supabase.from("private_profiles").upsert({ id: userId, birth_date: birthDate }, { onConflict: "id" });
  if (error) return `${error.message} (code ${error.code})${error.details ? ` — ${error.details}` : ""}`;
  const age = ageFrom(birthDate);
  if (makeMinorPrivate && age !== null && age < ADULT_AGE) {
    const { error: privateError } = await supabase.from("profiles").update({ is_private: true }).eq("id", userId);
    if (privateError) return `Passage en compte privé impossible : ${privateError.message} (code ${privateError.code})`;
  }
  return null;
}
