import { useMemo } from "react";
import { sportImage } from "./sportImages";
import { useSportsCatalog, type CatalogSport } from "./userSports";

// Liste commune des sports pour les publications : utilisée à la fois par le formulaire de /publier (valeur
// enregistrée dans posts.sport) et par les icônes de filtre de l'accueil (?sport=<valeur>). Les deux lisent donc
// exactement la même valeur pour un même sport : ils ne peuvent pas être différents.
//
// La source est le catalogue public.sports (lib/userSports.ts) : value = sports.slug, tel quel (ex. "hockey"),
// label = sports.name (ex. « Ski alpin »), image = photo ronde de lib/sportImages.ts (null : on garde l'émoji).
// Ne pas coder les valeurs en dur ailleurs : toujours passer par ce fichier.

export type SportOption = {
  id: number;
  value: string; // enregistré dans posts.sport et utilisé dans l'adresse (?sport=)
  label: string; // nom affiché
  emoji: string;
  image: string | null;
};

export function toSportOption(sport: CatalogSport): SportOption {
  return {
    id: sport.id,
    value: sport.slug,
    label: sport.name,
    emoji: sport.emoji,
    image: sportImage(sport.slug, sport.name),
  };
}

export function toSportOptions(catalog: CatalogSport[]): SportOption[] {
  return catalog.map(toSportOption);
}

// Sport correspondant à une valeur (ex. lue dans l'adresse) ; undefined si elle n'existe pas dans le catalogue
export function findSportOption(options: SportOption[], value: string | null | undefined): SportOption | undefined {
  return value ? options.find((option) => option.value === value) : undefined;
}

type OptionsState = { status: "loading" } | { status: "error" } | { status: "ready"; options: SportOption[] };

// Catalogue sous forme d'options (lu une seule fois par visite)
export function useSportOptions(): { state: OptionsState; retry: () => void } {
  const { state, retry } = useSportsCatalog();
  const options = useMemo<OptionsState>(
    () => (state.status === "ready" ? { status: "ready", options: toSportOptions(state.sports) } : state),
    [state]
  );
  return { state: options, retry };
}
