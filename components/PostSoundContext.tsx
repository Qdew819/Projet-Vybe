"use client";

import { createContext } from "react";

// Réglages du son d'origine de la publication affichée, lus par les vidéos du carrousel (VideoPlayer).
// Valeurs par défaut : son d'origine gardé, à plein volume (anciennes publications).
export const PostSoundContext = createContext<{ originalSound: boolean; originalVolume: number }>({
  originalSound: true,
  originalVolume: 1,
});
