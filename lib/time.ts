import type { Language } from "./language";

// Heure relative sans bibliothèque : « il y a 5 min », « il y a 2 h », « hier », « il y a 3 jours »…
export function relativeTime(date: string | Date, language: Language, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000); // négatif : dans le passé
  const locale = language === "en" ? "en-CA" : "fr-CA";
  // Format court pour les minutes et les heures (« il y a 5 min »), en toutes lettres au-delà (« il y a 3 jours »)
  const short = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const long = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "long" });

  const abs = Math.abs(seconds);
  if (abs < 60) return long.format(0, "second"); // « maintenant »
  if (abs < 3600) return short.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return short.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return long.format(Math.round(seconds / 86400), "day"); // « hier »
  if (abs < 86400 * 30) return long.format(Math.round(seconds / (86400 * 7)), "week");
  if (abs < 86400 * 365) return long.format(Math.round(seconds / (86400 * 30)), "month");
  return long.format(Math.round(seconds / (86400 * 365)), "year");
}
