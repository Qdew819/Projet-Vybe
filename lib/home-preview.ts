import type { Media } from "../components/home/MediaThumb";

// =====================================================================
//  DONNÉES D'EXEMPLE À REMPLACER PAR DE VRAIES DONNÉES
// ---------------------------------------------------------------------
//  Vidéos populaires affichées sur l'accueil en attendant la vraie table des
//  vidéos. Les boutons sont inactifs et annoncent « Bientôt ».
//  (Les événements et les publications sont déjà les vrais : HomeEvents, PostFeed.)
//  Pour brancher les vraies données : garder VideoCard (components/home/)
//  et lui passer les données lues dans Supabase.
//  Mettre SHOW_HOME_PREVIEW à false masque cette section.
// =====================================================================

export const SHOW_HOME_PREVIEW = true;

export const previewVideos: { id: string; title: string; duration: string; media: Media }[] = [
  {
    id: "intro",
    title: "Bienvenue sur VYBE",
    duration: "0:15",
    media: { kind: "image", src: "/intro-poster.jpg", alt: "Logo VYBE sur fond noir" },
  },
  {
    id: "hockey",
    title: "Les plus beaux buts de la semaine",
    duration: "1:12",
    media: { kind: "gradient", emoji: "🏒", alt: "Vidéo de hockey", from: "#0b2e14", to: "#020702" },
  },
  {
    id: "basketball",
    title: "Dunk au parc du quartier",
    duration: "0:38",
    media: { kind: "gradient", emoji: "🏀", alt: "Vidéo de basketball", from: "#3a1d07", to: "#070302" },
  },
  {
    id: "soccer",
    title: "Coup franc parfait",
    duration: "0:52",
    media: { kind: "gradient", emoji: "⚽", alt: "Vidéo de soccer", from: "#12261a", to: "#030806" },
  },
];
