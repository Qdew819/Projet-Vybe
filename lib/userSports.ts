"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "./i18n";
import { getLegacySport, normalizeSearch } from "./sports";
import { createClient } from "./supabase/client";

// Sports du profil : catalogue public.sports et choix de chaque personne dans public.user_sports.

export const MAX_SPORTS = 12;
export const SPORT_LEVELS = ["debutant", "intermediaire", "avance"] as const;
export type SportLevel = (typeof SPORT_LEVELS)[number];
export const DEFAULT_LEVEL: SportLevel = "debutant";

export type CatalogSport = { id: number; slug: string; name: string; emoji: string; search: string };
export type SportChoice = { sportId: number; level: SportLevel };
// Sport choisi, avec de quoi l'afficher (pastilles de l'en-tête)
export type UserSport = { sport: CatalogSport; level: SportLevel };

export const LEVEL_LABEL: Record<SportLevel, MessageKey> = {
  debutant: "sports.level.debutant",
  intermediaire: "sports.level.intermediaire",
  avance: "sports.level.avance",
};
// Niveau en minuscules, pour « Hockey, niveau avancé »
export const LEVEL_LOWER: Record<SportLevel, MessageKey> = {
  debutant: "sports.levelLower.debutant",
  intermediaire: "sports.levelLower.intermediaire",
  avance: "sports.levelLower.avance",
};

export function isLevel(value: unknown): value is SportLevel {
  return typeof value === "string" && (SPORT_LEVELS as readonly string[]).includes(value);
}

// ---------- Catalogue (40 sports, lu une seule fois par visite) ----------

let catalogPromise: Promise<CatalogSport[]> | null = null;

export function fetchCatalog(supabase: SupabaseClient = createClient()): Promise<CatalogSport[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const { data, error } = await supabase
        .from("sports")
        .select("id, slug, name, emoji, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw new Error(`Lecture du catalogue de sports impossible : ${error.message} (code ${error.code})`);
      return (data ?? []).map((row) => ({
        id: Number(row.id),
        slug: String(row.slug ?? ""),
        name: String(row.name ?? ""),
        emoji: String(row.emoji ?? ""),
        search: normalizeSearch(`${row.name ?? ""} ${String(row.slug ?? "").replace(/[-_]/g, " ")}`),
      }));
    })();
    // En cas d'échec, la prochaine demande réessaie
    catalogPromise.catch(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
}

type CatalogState = { status: "loading" } | { status: "error" } | { status: "ready"; sports: CatalogSport[] };

export function useSportsCatalog(): { state: CatalogState; retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchCatalog().then(
      (sports) => !cancelled && setState({ status: "ready", sports }),
      (err) => {
        console.error(err);
        if (!cancelled) setState({ status: "error" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return {
    state,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((n) => n + 1);
    },
  };
}

// ---------- Lecture ----------

type Row = { sport_id: number; level: string };

// Dans l'ordre d'ajout (created_at). Si la table n'a pas cette colonne, on lit sans tri.
async function fetchRows(supabase: SupabaseClient, userId: string): Promise<Row[]> {
  const ordered = await supabase
    .from("user_sports")
    .select("sport_id, level, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (!ordered.error) return (ordered.data ?? []) as Row[];
  if (ordered.error.code !== "42703" && ordered.error.code !== "PGRST204") {
    throw new Error(`Lecture des sports impossible : ${ordered.error.message} (code ${ordered.error.code})`);
  }
  const plain = await supabase.from("user_sports").select("sport_id, level").eq("user_id", userId);
  if (plain.error) throw new Error(`Lecture des sports impossible : ${plain.error.message} (code ${plain.error.code})`);
  return (plain.data ?? []) as Row[];
}

function toChoices(rows: Row[]): SportChoice[] {
  return rows.map((row) => ({ sportId: Number(row.sport_id), level: isLevel(row.level) ? row.level : DEFAULT_LEVEL }));
}

// Sports d'une personne, avec leur nom et leur émoji (en-tête du profil)
export async function fetchUserSports(supabase: SupabaseClient, userId: string): Promise<UserSport[]> {
  const [catalog, rows] = await Promise.all([fetchCatalog(supabase), fetchRows(supabase, userId)]);
  return withDetails(toChoices(rows), catalog);
}

export function withDetails(choices: SportChoice[], catalog: CatalogSport[]): UserSport[] {
  const byId = new Map(catalog.map((sport) => [sport.id, sport]));
  return choices.flatMap((choice) => {
    const sport = byId.get(choice.sportId);
    return sport ? [{ sport, level: choice.level }] : [];
  });
}

// Mes sports : importe d'abord les anciens sports de profiles.sports (une seule fois), puis lit user_sports
export async function loadMySports(supabase: SupabaseClient, userId: string): Promise<SportChoice[]> {
  try {
    await importLegacySports(supabase, userId);
  } catch (err) {
    // L'import ne doit jamais bloquer la page : on réessaiera à la prochaine visite
    console.error("Import des anciens sports impossible :", err);
  }
  return toChoices(await fetchRows(supabase, userId));
}

// Avant user_sports, les sports étaient une liste d'identifiants (ex. {hockey,soccer}) dans profiles.sports,
// avec les noms codés en dur dans lib/sports.ts. On les copie dans user_sports (niveau « debutant »),
// puis on vide profiles.sports : l'import ne se refait donc jamais.
async function importLegacySports(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await supabase.from("profiles").select("sports").eq("id", userId).maybeSingle();
  if (error) {
    // Colonne absente : rien à importer
    if (error.code === "42703" || error.code === "PGRST204") return;
    throw new Error(`${error.message} (code ${error.code})`);
  }
  const legacy = Array.isArray(data?.sports) ? data.sports.filter((id: unknown): id is string => typeof id === "string") : [];
  if (legacy.length === 0) return;

  // Si user_sports contient déjà quelque chose, on ne mélange pas : on se contente de vider l'ancienne colonne
  const existing = await fetchRows(supabase, userId);
  if (existing.length === 0) {
    const catalog = await fetchCatalog(supabase);
    const bySlug = new Map(catalog.map((sport) => [sport.slug, sport]));
    const byName = new Map(catalog.map((sport) => [normalizeSearch(sport.name), sport]));
    const ids: number[] = [];
    for (const oldId of legacy) {
      const old = getLegacySport(oldId);
      const match =
        bySlug.get(oldId) ??
        (old && (byName.get(normalizeSearch(old.fr)) ?? byName.get(normalizeSearch(old.en)))) ??
        byName.get(normalizeSearch(oldId.replace(/-/g, " ")));
      // Sports absents du catalogue : ignorés
      if (match && !ids.includes(match.id)) ids.push(match.id);
    }
    const rows = ids.slice(0, MAX_SPORTS).map((sportId) => ({ user_id: userId, sport_id: sportId, level: DEFAULT_LEVEL }));
    // Un par un, dans l'ordre : le premier ancien sport reste le premier ajouté
    for (const row of rows) {
      const { error: insertError } = await supabase
        .from("user_sports")
        .upsert(row, { onConflict: "user_id,sport_id", ignoreDuplicates: true });
      if (insertError) throw new Error(`${insertError.message} (code ${insertError.code})`);
    }
  }

  const { error: clearError } = await supabase.from("profiles").update({ sports: [] }).eq("id", userId);
  if (clearError) throw new Error(`${clearError.message} (code ${clearError.code})`);
}

// ---------- Enregistrement ----------

function errorKey(error: { message?: string; code?: string }): MessageKey {
  if (error.message?.includes("Maximum 12 sports")) return "sports.maxError";
  if (error.code === "42501") return "sports.authError";
  return "sports.saveError";
}

// Compare avec la base : upsert des sports ajoutés ou dont le niveau a changé, puis suppression des sports retirés.
// Renvoie la clé du message d'erreur à afficher, ou null si tout est enregistré.
export async function saveMySports(
  supabase: SupabaseClient,
  userId: string,
  choices: SportChoice[]
): Promise<MessageKey | null> {
  if (choices.length > MAX_SPORTS) return "sports.maxError";

  let existing: SportChoice[];
  try {
    existing = toChoices(await fetchRows(supabase, userId));
  } catch (err) {
    console.error(err);
    return "sports.saveError";
  }

  const before = new Map(existing.map((choice) => [choice.sportId, choice.level]));
  const wanted = new Set(choices.map((choice) => choice.sportId));
  const toUpsert = choices
    .filter((choice) => before.get(choice.sportId) !== choice.level)
    .map((choice) => ({ user_id: userId, sport_id: choice.sportId, level: choice.level }));
  const toDelete = existing.filter((choice) => !wanted.has(choice.sportId)).map((choice) => choice.sportId);
  const added = toUpsert.filter((row) => !before.has(row.sport_id)).length;

  async function upsert() {
    if (toUpsert.length === 0) return null;
    const { error } = await supabase.from("user_sports").upsert(toUpsert, { onConflict: "user_id,sport_id" });
    return error;
  }
  async function remove() {
    if (toDelete.length === 0) return null;
    const { error } = await supabase.from("user_sports").delete().eq("user_id", userId).in("sport_id", toDelete);
    return error;
  }

  // Normalement upsert puis delete (rien n'est retiré si l'ajout échoue). Mais si on remplace des sports
  // alors qu'on est déjà à 12, l'ajout dépasserait la limite : on retire d'abord.
  const steps = existing.length + added > MAX_SPORTS ? [remove, upsert] : [upsert, remove];
  for (const step of steps) {
    const error = await step();
    if (error) {
      console.error(`Enregistrement des sports impossible : ${error.message} (code ${error.code})`);
      return errorKey(error);
    }
  }
  return null;
}

export function sameChoices(a: SportChoice[], b: SportChoice[]): boolean {
  if (a.length !== b.length) return false;
  const levels = new Map(a.map((choice) => [choice.sportId, choice.level]));
  return b.every((choice) => levels.get(choice.sportId) === choice.level);
}
