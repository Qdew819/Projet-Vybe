"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// false au premier rendu (serveur ET passe d'hydratation du client), puis true juste après.
// Sert à n'afficher qu'après l'hydratation ce qui dépend du navigateur (ex. createPortal dans document.body) :
// la première passe du client est ainsi identique au HTML du serveur.
// Même effet que useState(false) + useEffect(() => setMounted(true), []), sans setState dans un effet
// (interdit par la règle react-hooks/set-state-in-effect) : pendant l'hydratation, React utilise la valeur
// « serveur » (false), puis refait un rendu avec la valeur « client » (true).
export function useMounted(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
}
