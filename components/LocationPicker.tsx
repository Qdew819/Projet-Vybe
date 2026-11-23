"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Combobox, { type ComboboxOption } from "./Combobox";
import {
  PRIORITY_COUNTRIES,
  cityLabelWithoutCountry,
  countryName,
  normalizeSearch,
  parseCityQuery,
  rankCities,
  regionMatches,
  type CityValue,
} from "../lib/cities";
import { useLanguage, useT } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";

const DEFAULT_COUNTRY = "CA";
const CITY_MIN_CHARS = 2;
const CITY_DELAY_MS = 250;
const CITY_MAX_RESULTS = 8;

// On demande plus de villes que ce qu'on affiche, pour remonter les noms exacts (Jackson avant Jacksonville)
const CITY_FETCH_RESULTS = 50;
// Recherche avec région, directement dans la table : plus large quand la région n'est pas une abréviation connue
const REGION_FETCH_LIMIT = 50;
const REGION_FETCH_LIMIT_BROAD = 300;

type CityResult = { id: number; label: string; name: string | null; region: string | null; country_code: string };

function isCityResult(row: unknown): row is CityResult {
  const r = row as Partial<CityResult> | null;
  return typeof r?.id === "number" && typeof r?.label === "string";
}

// Échappe % et _ pour un filtre LIKE
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Cherche les villes du pays. Le texte peut contenir la région : « Jackson, WY », « jackson wy », « jackson wyoming ».
// - Avec une région : lecture directe de la table cities (lisible par les personnes connectées), filtrée par région.
// - Toujours (sauf si la virgule rend la région explicite et qu'elle donne des résultats) : search_cities.
// Renvoie au plus CITY_MAX_RESULTS villes, noms exacts d'abord, ou null si tout a échoué.
async function fetchCities(text: string, country: string): Promise<CityResult[] | null> {
  const supabase = createClient();
  const query = parseCityQuery(text, country);
  const explicitRegion = text.includes(",") && query.region !== null;
  // Sans virgule, une région détectée peut faire partie du nom (« Port Washington ») : on cherche aussi le texte entier
  const plainQ = explicitRegion ? query.name : normalizeSearch(text.replace(/,/g, " "));

  const regionSearch =
    query.region && query.name.length >= CITY_MIN_CHARS
      ? (() => {
          let request = supabase
            .from("cities")
            .select("id, label, name, region, country_code")
            .eq("country_code", country)
            .like("search_text", `${escapeLike(query.name)}%`)
            .order("population", { ascending: false })
            .limit(query.regionCode ? REGION_FETCH_LIMIT : REGION_FETCH_LIMIT_BROAD);
          if (query.regionCode) request = request.eq("region", query.regionCode);
          return request;
        })()
      : null;
  const plainSearch = supabase.rpc("search_cities", { q: plainQ, p_country: country, max_results: CITY_FETCH_RESULTS });

  const [regionResult, plainResult] = await Promise.all([regionSearch, plainSearch]);
  if (regionResult?.error) {
    console.error(`Recherche de ville par région impossible : ${regionResult.error.message} (code ${regionResult.error.code})`);
  }
  if (plainResult.error) {
    console.error(`Recherche de ville impossible : ${plainResult.error.message} (code ${plainResult.error.code})`);
  }
  if (plainResult.error && (!regionSearch || regionResult?.error)) return null;

  const regionRows = rankCities(
    (Array.isArray(regionResult?.data) ? regionResult.data : []).filter(isCityResult).filter((row) => regionMatches(row.region, query)),
    query.name
  );
  let plainRows = rankCities((Array.isArray(plainResult.data) ? plainResult.data : []).filter(isCityResult), plainQ);
  // Région explicite (virgule) : on ne garde que les villes de cette région, sauf s'il n'y en a aucune
  if (explicitRegion) {
    const inRegion = plainRows.filter((row) => regionMatches(row.region, query));
    if (regionRows.length > 0 || inRegion.length > 0) plainRows = inRegion;
  }

  const seen = new Set<number>();
  const merged: CityResult[] = [];
  for (const row of [...regionRows, ...plainRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length === CITY_MAX_RESULTS) break;
  }
  return merged;
}

// Choix de la ville en deux temps : le pays (liste filtrée dans l'application), puis la ville
// (recherche dans la base, limitée à ce pays).
export default function LocationPicker({
  value,
  onChange,
}: {
  value: CityValue | null;
  onChange: (value: CityValue | null) => void;
}) {
  const t = useT();
  const language = useLanguage();

  // Pays disponibles (source de vérité : list_countries)
  const [countries, setCountries] = useState<string[] | null>(null);
  const [countriesFailed, setCountriesFailed] = useState(false);
  // Pays de la ville enregistrée, sinon le Canada
  const [country, setCountry] = useState<string | null>(value?.countryCode ?? DEFAULT_COUNTRY);
  const [countryQuery, setCountryQuery] = useState("");
  // Dernier pays choisi, pour savoir si on change vraiment de pays après « Changer »
  const lastCountry = useRef<string | null>(country);

  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [cityStatus, setCityStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [cityFailed, setCityFailed] = useState(false);
  const cityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Numéro de la dernière recherche : les réponses plus anciennes sont ignorées
  const cityRequest = useRef(0);
  const cityInput = useRef<HTMLInputElement>(null);
  const [focusCity, setFocusCity] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    createClient()
      .rpc("list_countries")
      .then(({ data, error }) => {
        if (error) {
          console.error(`Lecture des pays impossible : ${error.message} (code ${error.code})`);
          setCountriesFailed(true);
          setCountries([]);
          return;
        }
        // Lignes { country_code } ou simples codes (« CA »), selon la façon dont la fonction renvoie ses résultats
        const codes = (Array.isArray(data) ? data : [])
          .map((row: unknown) =>
            typeof row === "string" ? row : (row as { country_code?: unknown } | null)?.country_code
          )
          .filter((code): code is string => typeof code === "string" && code.trim().length === 2)
          .map((code) => code.trim().toUpperCase());
        if (codes.length === 0) {
          // Table cities encore vide : lancer scripts/import-cities.mjs
          console.warn("list_countries ne renvoie aucun pays : la table cities est-elle remplie ?", data);
        }
        setCountries([...new Set(codes)]);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (cityTimer.current) clearTimeout(cityTimer.current);
    };
  }, []);

  // Après un changement de pays, le focus passe sur le champ Ville
  useEffect(() => {
    if (focusCity > 0) cityInput.current?.focus();
  }, [focusCity]);

  // Pays triés : Canada, États-Unis, France, puis les autres par ordre alphabétique
  const sortedCountries = useMemo(() => {
    if (!countries) return [];
    const collator = new Intl.Collator(language);
    const items = countries.map((code) => ({
      code,
      name: countryName(code, language),
      // Recherche sur le nom français ET le nom anglais
      keys: [normalizeSearch(countryName(code, "fr")), normalizeSearch(countryName(code, "en"))],
    }));
    const priority = (code: string) => {
      const i = PRIORITY_COUNTRIES.indexOf(code);
      return i < 0 ? PRIORITY_COUNTRIES.length : i;
    };
    return items.sort((a, b) => priority(a.code) - priority(b.code) || collator.compare(a.name, b.name));
  }, [countries, language]);

  const countryOptions: ComboboxOption[] = useMemo(() => {
    const q = normalizeSearch(countryQuery);
    if (!q) return sortedCountries.map((c) => ({ id: c.code, label: c.name }));
    const starts: ComboboxOption[] = [];
    const contains: ComboboxOption[] = [];
    for (const c of sortedCountries) {
      if (c.keys.some((k) => k.startsWith(q))) starts.push({ id: c.code, label: c.name });
      else if (c.keys.some((k) => k.includes(q))) contains.push({ id: c.code, label: c.name });
    }
    return [...starts, ...contains];
  }, [sortedCountries, countryQuery]);

  // Le pays présélectionné n'est retenu que s'il fait partie de la liste
  const selectedCountry = country && countries?.includes(country) ? country : null;

  function resetCitySearch() {
    if (cityTimer.current) clearTimeout(cityTimer.current);
    cityRequest.current += 1;
    setCityQuery("");
    setCityResults([]);
    setCityStatus("idle");
    setCityFailed(false);
  }

  function chooseCountry(option: ComboboxOption) {
    setCountry(option.id);
    setCountryQuery("");
    if (option.id !== lastCountry.current) {
      lastCountry.current = option.id;
      resetCitySearch();
      if (value) onChange(null);
      setAnnouncement(t("location.countryChanged"));
      setFocusCity((n) => n + 1);
    }
  }

  function searchCity(text: string) {
    setCityQuery(text);
    setCityFailed(false);
    if (cityTimer.current) clearTimeout(cityTimer.current);
    const requestId = ++cityRequest.current;
    const q = normalizeSearch(text);
    if (q.length < CITY_MIN_CHARS || !selectedCountry) {
      setCityResults([]);
      setCityStatus("idle");
      return;
    }
    setCityStatus("loading");
    const pCountry = selectedCountry;
    cityTimer.current = setTimeout(async () => {
      const rows = await fetchCities(text, pCountry);
      if (requestId !== cityRequest.current) return; // une recherche plus récente a pris le relais
      if (rows === null) {
        setCityResults([]);
        setCityFailed(true);
        setCityStatus("idle");
        setAnnouncement(t("location.cityError"));
        return;
      }
      setCityResults(rows);
      setCityStatus("ready");
    }, CITY_DELAY_MS);
  }

  const cityOptions: ComboboxOption[] = cityResults.map((row) => ({
    id: String(row.id),
    label: cityLabelWithoutCountry(row.label, row.country_code || selectedCountry || ""),
  }));

  const selectedCity: ComboboxOption | null = value
    ? {
        id: String(value.cityId),
        label: cityLabelWithoutCountry(value.label, value.countryCode ?? selectedCountry ?? ""),
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Combobox
        id="pays"
        label={t("location.country")}
        placeholder={t("location.countryPlaceholder")}
        inputValue={countryQuery}
        onInputChange={setCountryQuery}
        options={countryOptions}
        selected={selectedCountry ? { id: selectedCountry, label: countryName(selectedCountry, language) } : null}
        onSelect={chooseCountry}
        onClear={() => {
          setCountry(null);
          setCountryQuery("");
        }}
        status={countries ? "ready" : "loading"}
        emptyMessage={t("location.noCountry")}
        disabled={!countries || countriesFailed || countries.length === 0}
        disabledHint={
          countriesFailed
            ? t("location.countriesError")
            : countries
              ? t("location.countriesEmpty")
              : t("location.countriesLoading")
        }
      />

      <Combobox
        id="ville"
        label={t("location.city")}
        placeholder={t("location.cityPlaceholder")}
        inputRef={cityInput}
        inputValue={cityQuery}
        onInputChange={searchCity}
        options={cityOptions}
        selected={selectedCity}
        onSelect={(option) => {
          const row = cityResults.find((r) => String(r.id) === option.id);
          if (!row) return;
          resetCitySearch();
          onChange({ cityId: row.id, label: row.label, countryCode: row.country_code || selectedCountry || undefined });
        }}
        onClear={() => {
          resetCitySearch();
          onChange(null);
        }}
        status={cityStatus}
        emptyMessage={t("location.noCity")}
        idleHint={cityFailed ? t("location.cityError") : t("location.cityHint")}
        disabled={!selectedCountry}
        disabledHint={t("location.cityNeedsCountry")}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
