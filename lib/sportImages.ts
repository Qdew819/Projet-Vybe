// Images rondes des sports (raccourcis de l'accueil), rangées par identifiant du catalogue (sports.slug).
// Chaque image est carrée (256 × 256) et contient déjà son anneau vert néon.
// Un sport sans image garde son émoji dans un cercle à bordure verte.
// Pour en ajouter une : déposer public/sports/<slug>.jpg et ajouter la ligne ici.
const SPORT_IMAGES: Record<string, string> = {
  hockey: "/sports/hockey.jpg",
  basketball: "/sports/basketball.jpg",
  volleyball: "/sports/volleyball.jpg",
  soccer: "/sports/soccer.jpg",
  rugby: "/sports/rugby.jpg",
};

export function sportImage(slug: string): string | null {
  return SPORT_IMAGES[slug] ?? null;
}
