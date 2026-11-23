// Remplit public.cities à partir des fichiers GeoNames (villes de 1 000 habitants et plus).
//
// À lancer depuis la racine du projet :
//   node --env-file=.env.local scripts/import-cities.mjs
//
// Le script peut être relancé : les villes sont mises à jour (upsert sur id), jamais en double.
// Il utilise la clé service role, lue dans l'environnement : elle n'est jamais affichée.
//
// Données géographiques © GeoNames (https://www.geonames.org), licence CC BY 4.0.

import { createClient } from "@supabase/supabase-js";
import { Unzip, UnzipInflate } from "fflate";

// ——— Réglages modifiables ———————————————————————————————————————————————

// Pays importés : "ALL" (tous les pays du fichier cities1000), ou un tableau de codes à deux lettres.
// Ancienne liste, pour y revenir :
// const COUNTRIES = ["CA", "US", "FR", "BE", "CH", "LU", "MC", "GB", "IE", "AU", "NZ", "HT", "MA", "DZ", "TN", "SN", "CI", "CM"];
const COUNTRIES = "ALL";

const CITIES_URL = "https://download.geonames.org/export/dump/cities1000.zip";
const CITIES_FILE = "cities1000.txt";
const ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
const BATCH_SIZE = 1000;
const SEARCH_TEXT_MAX = 400;
// Nombre de pays détaillés dans le résumé de fin (ceux qui ont le plus de villes)
const TOP_COUNTRIES_SHOWN = 15;

// ——— Normalisation : IDENTIQUE à normalizeSearch dans lib/cities.ts ——————————
// « St-Jérôme » → « saint jerome »

function normalizeSearch(text) {
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

// ——— Abréviations des provinces, territoires et États ————————————————————————
// Clés : noms normalisés tels qu'ils apparaissent dans admin1CodesASCII.txt

const CA_ABBR = {
  "alberta": "AB",
  "british columbia": "BC",
  "manitoba": "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "newfoundland": "NL",
  "nova scotia": "NS",
  "ontario": "ON",
  "prince edward island": "PE",
  "quebec": "QC",
  "saskatchewan": "SK",
  "yukon": "YT",
  "yukon territory": "YT",
  "northwest territories": "NT",
  "nunavut": "NU",
};

const US_ABBR = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
  "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
  "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
  "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
  "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
  "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
  "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC", "washington d c": "DC", "washington dc": "DC",
};

const ABBREVIATIONS = { CA: CA_ABBR, US: US_ABBR };

// ——— Outils ——————————————————————————————————————————————————————————

function fail(message) {
  console.error(`\nErreur : ${message}`);
  process.exit(1);
}

async function download(url) {
  console.log(`Téléchargement de ${url}…`);
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    fail(`téléchargement impossible (${url}) : ${err.message}`);
  }
  if (!response.ok) fail(`téléchargement impossible (${url}) : HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  console.log(`  ${(bytes.length / 1024 / 1024).toFixed(1)} Mo reçus.`);
  return bytes;
}

// Décompresse un fichier du zip au fil de l'eau et appelle onLine pour chaque ligne
function readZippedLines(zipBytes, fileName, onLine) {
  let found = false;
  let finished = false;
  const decoder = new TextDecoder("utf-8");
  let rest = "";
  const unzip = new Unzip((file) => {
    if (file.name !== fileName) return;
    found = true;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      rest += decoder.decode(chunk, { stream: !final });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) onLine(line);
      if (final) {
        if (rest) onLine(rest);
        finished = true;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(zipBytes, true);
  if (!found) fail(`fichier ${fileName} introuvable dans le zip.`);
  if (!finished) fail(`décompression de ${fileName} incomplète.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ——— Programme ——————————————————————————————————————————————————————

// Retire les espaces et les guillemets éventuels autour d'une valeur d'environnement
function cleanEnv(value) {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
// Clé secrète UNIQUEMENT (jamais NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ni la clé anon)
const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!url || !serviceKey) {
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  fail(
    `variable(s) d'environnement manquante(s) : ${missing.join(", ")}.\n` +
      "Ajoute-les dans .env.local puis lance : node --env-file=.env.local scripts/import-cities.mjs"
  );
}

// Type de clé, sans jamais en afficher le moindre caractère :
// "secret" (sb_secret_…), "publishable" (sb_publishable_…), "jwt:<rôle>" (ancienne clé) ou "inconnu"
function keyKind(key) {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return `jwt:${typeof payload.role === "string" ? payload.role : "?"}`;
    } catch {
      return "inconnu";
    }
  }
  return "inconnu";
}

const kind = keyKind(serviceKey);
const kindText = {
  secret: "clé secrète (nouveau format)",
  publishable: "clé PUBLIQUE (publishable)",
  "jwt:service_role": "ancienne clé service_role (JWT)",
  "jwt:anon": "ancienne clé PUBLIQUE anon (JWT)",
}[kind] ?? (kind.startsWith("jwt:") ? `ancienne clé JWT, rôle « ${kind.slice(4)} »` : "format de clé non reconnu");
console.log(`Clé lue dans SUPABASE_SERVICE_ROLE_KEY : ${kindText}.`);
if (kind === "publishable" || kind === "jwt:anon") {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY contient une clé publique : elle n'a pas le droit d'écrire dans cities.\n" +
      "Mets-y la clé secrète (Supabase → Project Settings → API Keys → Secret keys, « sb_secret_… »)."
  );
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// ——— Diagnostic : lecture puis écriture d'une ligne de test (id -1), supprimée aussitôt ————————

function describeError(error) {
  const parts = [error.code && `code ${error.code}`, error.message, error.details, error.hint].filter(Boolean);
  return parts.join(" — ");
}

function probableCause(error) {
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  if (message.includes("invalid api key") || message.includes("no api key") || code === "PGRST301" || message.includes("jwt")) {
    return "clé invalide : vérifie qu'elle est complète, à jour (pas révoquée) et qu'elle appartient bien à ce projet (même URL).";
  }
  if (code === "42501" || message.includes("permission denied")) {
    return (
      "droits manquants : la requête arrive dans la base avec un rôle qui n'a pas le droit d'écrire dans cities.\n" +
      "  • Si la clé est bien « sb_secret_… », vérifie qu'elle vient de ce projet-ci (même URL que NEXT_PUBLIC_SUPABASE_URL).\n" +
      "  • Vérifie dans le SQL Editor : grant usage on schema public to service_role;\n" +
      "    grant all on table public.cities to service_role;\n" +
      "  • Une clé publique (anon / publishable) donne exactement cette erreur."
    );
  }
  if (code === "42P01" || code === "PGRST205" || message.includes("does not exist") || message.includes("could not find the table")) {
    return "table introuvable : public.cities n'existe pas dans ce projet, ou l'API ne la voit pas encore (recharge le schéma : notify pgrst, 'reload schema';).";
  }
  if (code === "23502" || code === "PGRST204") {
    return "colonne manquante ou obligatoire : la structure de public.cities ne correspond pas à celle attendue par le script.";
  }
  return "cause inconnue : voir le message ci-dessus.";
}

async function checkConnection() {
  console.log("\nTest de connexion et d'écriture…");
  const read = await supabase.from("cities").select("id", { count: "exact", head: true });
  if (read.error) {
    console.error(`  Lecture impossible : ${describeError(read.error)}`);
    fail(`cause probable : ${probableCause(read.error)}`);
  }

  const testRow = {
    id: -1,
    name: "Test Vybe",
    region: null,
    country_code: "CA",
    label: "Test Vybe, Canada",
    search_text: "test vybe",
    latitude: 0,
    longitude: 0,
    population: 0,
  };
  const write = await supabase.from("cities").upsert(testRow, { onConflict: "id" });
  if (write.error) {
    console.error(`  Écriture impossible : ${describeError(write.error)}`);
    fail(`cause probable : ${probableCause(write.error)}`);
  }
  const removal = await supabase.from("cities").delete().eq("id", -1);
  if (removal.error) {
    console.error(`  Suppression de la ligne de test impossible : ${describeError(removal.error)}`);
    fail(`cause probable : ${probableCause(removal.error)}\n  (Supprime-la à la main : delete from public.cities where id = -1;)`);
  }
  console.log(`  Connexion et écriture OK (${read.count ?? 0} villes déjà présentes).\n`);
}

await checkConnection();

// Filtre des pays : null = tous les pays
if (COUNTRIES !== "ALL" && !(Array.isArray(COUNTRIES) && COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c)))) {
  fail('COUNTRIES doit valoir "ALL" ou un tableau de codes pays à deux lettres en majuscules (ex. ["CA", "FR"]).');
}
const wanted = COUNTRIES === "ALL" ? null : new Set(COUNTRIES);
const isWanted = (code) => /^[A-Z]{2}$/.test(code ?? "") && (wanted === null || wanted.has(code));

// Nom du pays en français ; le code lui-même si Intl ne le reconnaît pas (sans faire échouer le script)
const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
const countryNameCache = new Map();
function countryNameFr(code) {
  if (!countryNameCache.has(code)) {
    let name = code;
    try {
      const found = displayNames.of(code);
      if (typeof found === "string" && found.trim()) name = found;
    } catch {
      // code non reconnu : on garde le code
    }
    countryNameCache.set(code, name);
  }
  return countryNameCache.get(code);
}

// 1. Régions (admin1) : « PAYS.CODE » → nom de région, ou abréviation pour le Canada et les États-Unis
const admin1Text = new TextDecoder("utf-8").decode(await download(ADMIN1_URL));
const regions = new Map();
const unknownNames = [];
for (const rawLine of admin1Text.split("\n")) {
  const line = rawLine.replace(/\r$/, "");
  if (!line) continue;
  const [key, name, asciiName] = line.split("\t");
  if (!key || !name) continue;
  const country = key.split(".")[0];
  if (!isWanted(country)) continue;
  const abbreviations = ABBREVIATIONS[country];
  if (abbreviations) {
    const abbr = abbreviations[normalizeSearch(asciiName || name)] ?? abbreviations[normalizeSearch(name)];
    if (abbr) {
      regions.set(key, abbr);
    } else {
      unknownNames.push(`${key} « ${name} »`);
      // Repli : le code GeoNames s'il ressemble à une abréviation, sinon le nom complet
      const code = key.split(".")[1];
      regions.set(key, /^[A-Z]{2}$/.test(code) ? code : name);
    }
  } else {
    regions.set(key, name);
  }
}
if (unknownNames.length) {
  console.warn(`\nAttention : abréviation inconnue pour ${unknownNames.length} région(s), nom ou code gardé tel quel :`);
  for (const n of unknownNames) console.warn(`  - ${n}`);
  console.warn("");
}
console.log(`${regions.size} régions chargées.`);

// 2. Villes
const zipBytes = await download(CITIES_URL);
console.log(`Lecture de ${CITIES_FILE}…`);
const rows = new Map();
let unknownRegionCities = 0;
let skippedNoCountry = 0;
readZippedLines(zipBytes, CITIES_FILE, (rawLine) => {
  const line = rawLine.replace(/\r$/, "");
  if (!line) return;
  const cols = line.split("\t");
  const countryCode = cols[8]?.trim();
  if (!isWanted(countryCode)) {
    if (!/^[A-Z]{2}$/.test(countryCode ?? "")) skippedNoCountry += 1;
    return;
  }

  const id = Number(cols[0]);
  const name = cols[1]?.trim();
  if (!Number.isSafeInteger(id) || !name) return;
  const asciiName = cols[2] ?? "";
  const alternateNames = cols[3] ? cols[3].split(",") : [];
  const latitude = Number.parseFloat(cols[4]);
  const longitude = Number.parseFloat(cols[5]);
  const admin1 = cols[10];
  const population = Number.parseInt(cols[14], 10);

  // Région : abréviation (Canada, États-Unis) ou nom d'admin1CodesASCII.txt ; absente si inconnue (comptée)
  let region = null;
  if (admin1 && admin1 !== "00") {
    region = regions.get(`${countryCode}.${admin1}`) ?? null;
    if (region === null) unknownRegionCities += 1;
  }
  const country = countryNameFr(countryCode);
  const label = region ? `${name}, ${region}, ${country}` : `${name}, ${country}`;

  // Nom principal normalisé en premier (tel quel, pour la recherche par début de nom),
  // puis les mots des autres noms qui n'y sont pas déjà
  const main = normalizeSearch(name);
  const seen = new Set(main.split(" "));
  const extra = [];
  for (const other of [asciiName, ...alternateNames]) {
    for (const word of normalizeSearch(other).split(" ")) {
      if (word && !seen.has(word)) {
        seen.add(word);
        extra.push(word);
      }
    }
  }
  let searchText = [main, ...extra].join(" ");
  if (searchText.length > SEARCH_TEXT_MAX) {
    searchText = searchText.slice(0, SEARCH_TEXT_MAX);
    const lastSpace = searchText.lastIndexOf(" ");
    if (lastSpace > main.length) searchText = searchText.slice(0, lastSpace);
  }

  rows.set(id, {
    id,
    name,
    region,
    country_code: countryCode,
    label,
    search_text: searchText,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    population: Number.isFinite(population) ? population : 0,
  });
});

const all = [...rows.values()];
const perCountry = new Map();
for (const row of all) perCountry.set(row.country_code, (perCountry.get(row.country_code) ?? 0) + 1);
console.log(`${all.length} villes retenues dans ${perCountry.size} pays.`);
if (all.length === 0) fail("aucune ville à envoyer.");

// 3. Envoi par lots
console.log(`\nEnvoi vers Supabase par lots de ${BATCH_SIZE}…`);
let sent = 0;
for (let start = 0; start < all.length; start += BATCH_SIZE) {
  const batch = all.slice(start, start + BATCH_SIZE);
  let attempt = 0;
  for (;;) {
    const { error } = await supabase.from("cities").upsert(batch, { onConflict: "id" });
    if (!error) break;
    attempt += 1;
    if (attempt >= 3) {
      fail(
        `envoi du lot ${start + 1}–${start + batch.length} impossible : ${describeError(error)}\n` +
          `  cause probable : ${probableCause(error)}`
      );
    }
    console.warn(`  Lot ${start + 1}–${start + batch.length} refusé (${error.message}), nouvel essai…`);
    await sleep(1000 * attempt);
  }
  sent += batch.length;
  const percent = Math.round((sent / all.length) * 100);
  console.log(`  ${sent} / ${all.length} (${percent} %)`);
}

const topCountries = [...perCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_COUNTRIES_SHOWN);
console.log(`\nTerminé : ${sent} villes importées ou mises à jour, dans ${perCountry.size} pays.`);
console.log(`Les ${topCountries.length} pays qui ont le plus de villes :`);
for (const [code, count] of topCountries) console.log(`  ${code}  ${countryNameFr(code)} : ${count}`);
if (unknownRegionCities > 0) {
  console.log(`Villes sans région (code de région introuvable dans admin1CodesASCII.txt) : ${unknownRegionCities}`);
}
if (skippedNoCountry > 0) console.log(`Lignes ignorées (code pays absent ou invalide) : ${skippedNoCountry}`);
console.log("Données géographiques © GeoNames, licence CC BY 4.0");
