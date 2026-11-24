import type { Media } from "../components/home/MediaThumb";
import type { PostAuthor } from "../components/home/PostCard";

// =====================================================================
//  DONNÉES D'EXEMPLE À REMPLACER PAR DE VRAIES DONNÉES
// ---------------------------------------------------------------------
//  Publication et vidéos affichées sur l'accueil en attendant les vraies
//  tables (publications, vidéos). Les boutons de ces blocs sont inactifs et
//  annoncent « Bientôt ». (Les événements sont déjà les vrais : HomeEvents.)
//  Pour brancher les vraies données : garder PostCard et VideoCard
//  (components/home/) et leur passer les données lues dans Supabase.
//  Mettre SHOW_HOME_PREVIEW à false masque ces deux sections.
// =====================================================================

export const SHOW_HOME_PREVIEW = true;

export const previewPost: {
  author: PostAuthor;
  timeLabel: string;
  text: string;
  media: Media;
  duration: string;
  likes: number;
  comments: number;
  shares: number;
} = {
  author: { name: "VYBE", avatar: "/logo.jpg", verified: true },
  timeLabel: "il y a 2 h",
  text: "La communauté VYBE grandit chaque jour ! 🔥\nQui est partant pour une partie de hockey ce week-end ?",
  media: { kind: "image", src: "/accueil-vybe.jpg", alt: "Silhouettes de sportifs dans un stade", position: "50% 74%" },
  duration: "0:45",
  likes: 742,
  comments: 87,
  shares: 45,
};

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
