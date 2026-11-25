import { normalizeSearch, sportMoodKeywords } from "./sports";

// Mots-clés d'ambiance tirés du TEXTE d'une publication, pour les suggestions de musique Epidemic Sound.
// Simple liste de correspondances : débuts de mots français (sans accents) → mots-clés anglais de recherche.
// Pas d'IA externe : le texte ne quitte pas notre serveur, seuls ces mots-clés anglais sont envoyés.
const TEXT_MOODS: { stems: string[]; keywords: string[] }[] = [
  { stems: ["victoire", "gagn", "champion", "vainqu", "titre", "medaille", "trophee", "podium"], keywords: ["triumphant", "epic"] },
  { stems: ["fete", "party", "celebr", "soiree", "anniversaire"], keywords: ["party", "happy"] },
  { stems: ["entrainement", "entraine", "training", "seance", "gym", "workout", "muscu"], keywords: ["workout", "motivational"] },
  { stems: ["detente", "relax", "calme", "chill", "repos", "zen", "tranquill"], keywords: ["chill", "calm"] },
  { stems: ["match", "competition", "tournoi", "finale", "derby", "playoff", "series"], keywords: ["intense", "energetic"] },
  { stems: ["defaite", "perdu", "triste", "decu", "blessure", "blesse"], keywords: ["sad", "emotional"] },
  { stems: ["equipe", "amis", "ami", "gang", "ensemble", "famille"], keywords: ["feel good", "uplifting"] },
  { stems: ["ete", "plage", "soleil", "vacances"], keywords: ["summer", "sunny"] },
  { stems: ["hiver", "neige", "froid", "glace"], keywords: ["winter", "cinematic"] },
  { stems: ["vitesse", "rapide", "sprint", "course"], keywords: ["fast", "driving"] },
  { stems: ["record", "exploit", "objectif", "reve", "depass"], keywords: ["inspiring", "epic"] },
  { stems: ["motivation", "motive", "jamais", "lache", "force"], keywords: ["motivational", "powerful"] },
  { stems: ["nuit", "soir"], keywords: ["night", "dark"] },
  { stems: ["amour", "love"], keywords: ["romantic"] },
  { stems: ["fun", "drole", "rire", "lol"], keywords: ["playful", "funny"] },
];

const MAX_KEYWORDS = 5;

export function textMoodKeywords(text: string | null | undefined): string[] {
  const words = normalizeSearch(text ?? "").split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const found: string[] = [];
  for (const { stems, keywords } of TEXT_MOODS) {
    if (words.some((word) => stems.some((stem) => word.startsWith(stem)))) found.push(...keywords);
  }
  return [...new Set(found)].slice(0, MAX_KEYWORDS);
}

// Mots-clés de la publication : sport d'abord, puis texte (sans doublons, 5 au plus)
export function postMoodKeywords(sport: string | null | undefined, text: string | null | undefined): string[] {
  return [...new Set([...sportMoodKeywords(sport), ...textMoodKeywords(text)])].slice(0, MAX_KEYWORDS);
}
