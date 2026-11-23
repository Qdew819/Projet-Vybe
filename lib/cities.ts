// Villes et pays : normalisation du texte de recherche et libellés affichés.
// ATTENTION : normalizeSearch est dupliquée dans scripts/import-cities.mjs.
// Les deux doivent rester identiques, sinon la recherche ne trouve plus les villes.

export type CityValue = {
  cityId: number;
  label: string; // libellé complet : « Saint-Jérôme, QC, Canada »
  countryCode?: string; // pays de la ville, pour présélectionner le champ « Pays »
};

// « St-Jérôme » → « saint jerome »
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-‐‑–—'’‘ʼ.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word === "st" ? "saint" : word === "ste" ? "sainte" : word))
    .join(" ");
}

// Pays mis en tête de liste, dans cet ordre
export const PRIORITY_COUNTRIES = ["CA", "US", "FR"];

const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(language: string): Intl.DisplayNames | null {
  if (!displayNames.has(language)) {
    try {
      displayNames.set(language, new Intl.DisplayNames([language], { type: "region" }));
    } catch {
      displayNames.set(language, null);
    }
  }
  return displayNames.get(language) ?? null;
}

// Nom du pays dans la langue donnée (« CA » → « Canada »), ou le code si le navigateur ne sait pas
export function countryName(code: string, language: string): string {
  try {
    return namesFor(language)?.of(code) ?? code;
  } catch {
    return code;
  }
}

// Retire le dernier segment du libellé quand c'est le pays : « Saint-Jérôme, QC, Canada » → « Saint-Jérôme, QC »
export function cityLabelWithoutCountry(label: string, countryCode: string): string {
  for (const language of ["fr", "en"]) {
    const suffix = `, ${countryName(countryCode, language)}`;
    if (label.endsWith(suffix)) return label.slice(0, -suffix.length);
  }
  return label;
}

// Libellé affiché sur un profil : sans « , Canada » à la fin
export function displayCityLabel(label: string): string {
  return label.replace(/, Canada$/, "");
}

// ——— Recherche d'une ville avec sa région (« Jackson, WY », « jackson wyoming ») ———————————

// Noms des provinces et États (normalisés) → abréviation enregistrée dans cities.region
const REGION_ABBREVIATIONS: Record<string, Record<string, string>> = {
  CA: {
    "alberta": "AB", "colombie britannique": "BC", "british columbia": "BC", "manitoba": "MB",
    "nouveau brunswick": "NB", "new brunswick": "NB", "terre neuve et labrador": "NL", "terre neuve": "NL",
    "newfoundland and labrador": "NL", "newfoundland": "NL", "nouvelle ecosse": "NS", "nova scotia": "NS",
    "ontario": "ON", "ile du prince edouard": "PE", "prince edward island": "PE", "quebec": "QC",
    "saskatchewan": "SK", "yukon": "YT", "territoires du nord ouest": "NT", "northwest territories": "NT",
    "nunavut": "NU",
  },
  US: {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "californie": "CA", "california": "CA",
    "caroline du nord": "NC", "north carolina": "NC", "caroline du sud": "SC", "south carolina": "SC",
    "colorado": "CO", "connecticut": "CT", "dakota du nord": "ND", "north dakota": "ND",
    "dakota du sud": "SD", "south dakota": "SD", "delaware": "DE", "floride": "FL", "florida": "FL",
    "georgie": "GA", "georgia": "GA", "hawai": "HI", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiane": "LA", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "nouveau mexique": "NM", "new mexico": "NM",
    "new york": "NY", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvanie": "PA",
    "pennsylvania": "PA", "rhode island": "RI", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginie": "VA", "virginia": "VA", "virginie occidentale": "WV", "west virginia": "WV",
    "washington": "WA", "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
  },
};

// Abréviation de région (« WY ») si le texte en est une pour ce pays, sinon null
function regionAbbreviation(text: string, countryCode: string): string | null {
  const names = REGION_ABBREVIATIONS[countryCode];
  if (!names) return null;
  if (names[text]) return names[text];
  const upper = text.toUpperCase();
  return Object.values(names).includes(upper) ? upper : null;
}

export type CityQuery = {
  name: string; // nom normalisé à chercher (« jackson »)
  region: string | null; // région normalisée (« wy », « ile de france »), si la personne en a tapé une
  regionCode: string | null; // abréviation exacte (« WY ») pour le Canada et les États-Unis
};

// « Jackson, WY » → { name: "jackson", region: "wy", regionCode: "WY" }
// Sans virgule, les derniers mots comptent comme région seulement s'ils sont un État ou une province connus
// (« jackson wyoming »), pour ne pas couper un nom comme « New York ».
export function parseCityQuery(text: string, countryCode: string): CityQuery {
  const comma = text.indexOf(",");
  if (comma >= 0) {
    const name = normalizeSearch(text.slice(0, comma));
    const region = normalizeSearch(text.slice(comma + 1));
    if (name && region) return { name, region, regionCode: regionAbbreviation(region, countryCode) };
    return { name: name || normalizeSearch(text), region: null, regionCode: null };
  }
  const words = normalizeSearch(text).split(" ").filter(Boolean);
  for (let size = Math.min(3, words.length - 1); size >= 1; size--) {
    const candidate = words.slice(-size).join(" ");
    const code = regionAbbreviation(candidate, countryCode);
    if (code) return { name: words.slice(0, -size).join(" "), region: candidate, regionCode: code };
  }
  return { name: words.join(" "), region: null, regionCode: null };
}

// La région d'une ville correspond-elle à celle tapée ? (abréviation exacte, sinon début du nom normalisé)
export function regionMatches(cityRegion: string | null, query: CityQuery): boolean {
  if (!query.region) return true;
  if (!cityRegion) return false;
  if (query.regionCode) return cityRegion === query.regionCode;
  return normalizeSearch(cityRegion).startsWith(query.region);
}

// Nom exact d'abord (Jackson avant Jacksonville), puis nom qui commence par le texte, puis le reste ;
// l'ordre reçu (pertinence ou population) est gardé à l'intérieur de chaque groupe
export function rankCities<T extends { name?: string | null }>(rows: T[], name: string): T[] {
  const score = (row: T) => {
    const n = normalizeSearch(row.name ?? "");
    if (n === name) return 0;
    if (n.startsWith(`${name} `)) return 1;
    if (n.startsWith(name)) return 2;
    return 3;
  };
  return rows
    .map((row, index) => ({ row, index, score: score(row) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((item) => item.row);
}
