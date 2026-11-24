// Images rondes des sports (raccourcis de l'accueil).
// Chaque image est carrée (256 × 256) et contient déjà son anneau vert néon.
// Un sport sans image garde son émoji dans un cercle à bordure verte.
// Pour en ajouter une : déposer public/sports/<nom>.jpg et ajouter une ou plusieurs clés ici.
//
// Clés : identifiant du catalogue (sports.slug) OU nom du sport, écrits sans accents, en minuscules,
// mots séparés par des tirets (« Ski alpin » → "ski-alpin", "alpine_skiing" → "alpine-skiing").
// Le catalogue est dans la base : son identifiant peut différer de lib/sports.ts, d'où les clés par nom.
const SPORT_IMAGES: Record<string, string> = {
  hockey: "/sports/hockey.jpg",
  basketball: "/sports/basketball.jpg",
  volleyball: "/sports/volleyball.jpg",
  soccer: "/sports/soccer.jpg",
  rugby: "/sports/rugby.jpg",
  "alpine-skiing": "/sports/alpine-skiing.jpg",
  "ski-alpin": "/sports/alpine-skiing.jpg",
  tennis: "/sports/tennis.jpg",
  golf: "/sports/golf.jpg",
  baseball: "/sports/baseball.jpg",
  football: "/sports/football.jpg",
  badminton: "/sports/badminton.jpg",
  "floor-hockey": "/sports/floor-hockey.jpg",
  "hockey-cosom": "/sports/floor-hockey.jpg",
  softball: "/sports/softball.jpg",
  "balle-molle": "/sports/softball.jpg",
  pickleball: "/sports/pickleball.jpg",
  swimming: "/sports/swimming.jpg",
  natation: "/sports/swimming.jpg",
  running: "/sports/running.jpg",
  "course-a-pied": "/sports/running.jpg",
  cycling: "/sports/cycling.jpg",
  "cyclisme-sur-route": "/sports/cycling.jpg",
  cyclisme: "/sports/cycling.jpg",
  velo: "/sports/cycling.jpg",
  "cross-country-skiing": "/sports/cross-country-skiing.jpg",
  "ski-de-fond": "/sports/cross-country-skiing.jpg",
  snowboarding: "/sports/snowboarding.jpg",
  "planche-a-neige": "/sports/snowboarding.jpg",
  "ice-skating": "/sports/ice-skating.jpg",
  patinage: "/sports/ice-skating.jpg",
  "figure-skating": "/sports/ice-skating.jpg",
  "patinage-artistique": "/sports/ice-skating.jpg",
  ringette: "/sports/ringette.jpg",
  ringuette: "/sports/ringette.jpg",
  curling: "/sports/curling.jpg",
};

function toKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
}

// Cherche d'abord par identifiant, puis par nom du sport
export function sportImage(slug: string, name = ""): string | null {
  return SPORT_IMAGES[toKey(slug)] ?? (name ? SPORT_IMAGES[toKey(name)] : undefined) ?? null;
}
