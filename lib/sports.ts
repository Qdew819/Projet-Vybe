import type { Language } from "./language";

// Liste des sports proposés sur Vybe : [identifiant, nom français, nom anglais, emoji, mots-clés de recherche]
// L'identifiant est enregistré dans profiles.sports : ne jamais le changer une fois utilisé.
type SportRow = [id: string, fr: string, en: string, emoji: string, keywords?: string];

const SPORT_ROWS: SportRow[] = [
  // Hockey et sports de bâton
  ["hockey", "Hockey", "Ice hockey", "🏒", "hockey sur glace lnh nhl"],
  ["ball-hockey", "Hockey balle", "Ball hockey", "🏒", "hockey de rue street"],
  ["dek-hockey", "Dek hockey", "Dek hockey", "🏒"],
  ["floor-hockey", "Hockey cosom", "Floor hockey", "🏒", "cosom gymnase"],
  ["inline-hockey", "Hockey en ligne", "Inline hockey", "🏒", "roller hockey patins a roues"],
  ["sledge-hockey", "Para-hockey sur glace", "Sledge hockey", "🏒", "luge para"],
  ["field-hockey", "Hockey sur gazon", "Field hockey", "🏑", "hockey sur herbe"],
  ["underwater-hockey", "Hockey subaquatique", "Underwater hockey", "🤿", "octopush"],
  ["ringette", "Ringuette", "Ringette", "🏒"],
  ["bandy", "Bandy", "Bandy", "🏒"],
  ["floorball", "Floorball", "Floorball", "🏑", "unihockey"],
  ["broomball", "Ballon-balai", "Broomball", "🧹", "ballon balai"],
  ["lacrosse", "Crosse", "Lacrosse", "🥍", "lacrosse au champ"],
  ["box-lacrosse", "Crosse en enclos", "Box lacrosse", "🥍", "crosse interieure"],
  ["hurling", "Hurling", "Hurling", "🏑"],
  ["camogie", "Camogie", "Camogie", "🏑"],

  // Sports de ballon en équipe
  ["soccer", "Soccer", "Soccer", "⚽", "football europeen foot futbol fifa"],
  ["futsal", "Futsal", "Futsal", "⚽", "soccer interieur"],
  ["beach-soccer", "Soccer de plage", "Beach soccer", "⚽", "football de plage"],
  ["football", "Football", "American football", "🏈", "football americain nfl"],
  ["canadian-football", "Football canadien", "Canadian football", "🏈", "lcf cfl"],
  ["flag-football", "Flag-football", "Flag football", "🏈", "football drapeau"],
  ["basketball", "Basketball", "Basketball", "🏀", "basket nba ballon panier"],
  ["basketball-3x3", "Basketball 3x3", "3x3 basketball", "🏀", "basket trois"],
  ["wheelchair-basketball", "Basketball en fauteuil roulant", "Wheelchair basketball", "🏀", "para"],
  ["volleyball", "Volleyball", "Volleyball", "🏐", "volley ballon volant"],
  ["beach-volleyball", "Volleyball de plage", "Beach volleyball", "🏐", "volley plage sable"],
  ["sitting-volleyball", "Volleyball assis", "Sitting volleyball", "🏐", "para"],
  ["baseball", "Baseball", "Baseball", "⚾", "mlb balle"],
  ["softball", "Balle molle", "Softball", "🥎", "softball"],
  ["rugby", "Rugby à XV", "Rugby union", "🏉", "rugby quinze"],
  ["rugby-sevens", "Rugby à 7", "Rugby sevens", "🏉", "rugby sept"],
  ["rugby-league", "Rugby à XIII", "Rugby league", "🏉", "rugby treize"],
  ["wheelchair-rugby", "Rugby en fauteuil roulant", "Wheelchair rugby", "🏉", "para murderball"],
  ["australian-football", "Football australien", "Australian rules football", "🏉", "afl"],
  ["gaelic-football", "Football gaélique", "Gaelic football", "🏉"],
  ["handball", "Handball", "Handball", "🤾", "hand"],
  ["beach-handball", "Handball de plage", "Beach handball", "🤾"],
  ["water-polo", "Water-polo", "Water polo", "🤽", "waterpolo"],
  ["ultimate", "Ultimate frisbee", "Ultimate frisbee", "🥏", "disque frisbee"],
  ["cricket", "Cricket", "Cricket", "🏏"],
  ["netball", "Netball", "Netball", "🏐"],
  ["korfball", "Korfball", "Korfball", "🏐"],
  ["kin-ball", "Kin-ball", "Kin-ball", "🔵", "kinball omnikin"],
  ["kabaddi", "Kabaddi", "Kabaddi", "🤼"],
  ["sepak-takraw", "Sepak takraw", "Sepak takraw", "🏐"],
  ["dodgeball", "Ballon chasseur", "Dodgeball", "🔴", "ballon-chasseur ballon prisonnier"],
  ["kickball", "Kickball", "Kickball", "🔴", "balle au pied"],
  ["roundnet", "Spikeball (roundnet)", "Roundnet (Spikeball)", "🟡", "spikeball"],
  ["quadball", "Quadball (quidditch)", "Quadball (quidditch)", "🧹", "quidditch"],
  ["tchoukball", "Tchoukball", "Tchoukball", "🤾"],
  ["goalball", "Goalball", "Goalball", "🔔", "para aveugle"],
  ["teqball", "Teqball", "Teqball", "⚽"],
  ["footvolley", "Footvolley", "Footvolley", "⚽"],
  ["footbag", "Aki (footbag)", "Footbag (hacky sack)", "🟡", "hacky sack"],
  ["polo", "Polo", "Polo", "🏇", "cheval"],

  // Sports de raquette
  ["tennis", "Tennis", "Tennis", "🎾", "atp wta"],
  ["table-tennis", "Tennis de table", "Table tennis", "🏓", "ping-pong ping pong"],
  ["badminton", "Badminton", "Badminton", "🏸", "volant"],
  ["pickleball", "Pickleball", "Pickleball", "🏓"],
  ["padel", "Padel", "Padel", "🎾", "paddle"],
  ["squash", "Squash", "Squash", "🎾"],
  ["racquetball", "Racquetball", "Racquetball", "🎾"],
  ["beach-tennis", "Tennis de plage", "Beach tennis", "🎾"],
  ["basque-pelota", "Pelote basque", "Basque pelota", "🎾", "jai alai cesta punta"],

  // Précision et cibles
  ["golf", "Golf", "Golf", "⛳", "pga"],
  ["mini-golf", "Mini-golf", "Mini golf", "⛳", "golf miniature"],
  ["disc-golf", "Disc golf", "Disc golf", "🥏", "frisbee golf"],
  ["footgolf", "Footgolf", "Footgolf", "⚽"],
  ["bowling", "Quilles", "Bowling", "🎳", "bowling petites quilles grosses quilles"],
  ["curling", "Curling", "Curling", "🥌"],
  ["petanque", "Pétanque", "Pétanque", "🟤", "boules"],
  ["bocce", "Bocce", "Bocce", "🟤", "boules italiennes"],
  ["lawn-bowls", "Boulingrin", "Lawn bowls", "🟤", "boules sur gazon"],
  ["boccia", "Boccia", "Boccia", "🔴", "para"],
  ["molkky", "Mölkky", "Mölkky", "🪵", "molkky quilles finlandaises"],
  ["shuffleboard", "Galet (shuffleboard)", "Shuffleboard", "🥌", "palet"],
  ["horseshoes", "Fers à cheval", "Horseshoes", "🧲"],
  ["cornhole", "Jeu de poches (cornhole)", "Cornhole", "🎯", "poches sacs"],
  ["croquet", "Croquet", "Croquet", "🔨"],
  ["billiards", "Billard", "Billiards", "🎱", "pool 8 ball"],
  ["snooker", "Snooker", "Snooker", "🎱", "billard anglais"],
  ["darts", "Fléchettes", "Darts", "🎯", "dards"],
  ["archery", "Tir à l’arc", "Archery", "🏹", "arc"],
  ["shooting", "Tir sportif", "Sport shooting", "🎯", "carabine pistolet tir au pigeon"],
  ["biathlon", "Biathlon", "Biathlon", "🎿", "ski tir"],
  ["axe-throwing", "Lancer de hache", "Axe throwing", "🪓", "hache"],
  ["paintball", "Paintball", "Paintball", "🎯"],
  ["airsoft", "Airsoft", "Airsoft", "🎯"],
  ["table-football", "Baby-foot", "Table football", "⚽", "foosball soccer sur table"],

  // Sports de combat et arts martiaux
  ["boxing", "Boxe", "Boxing", "🥊", "boxe anglaise"],
  ["kickboxing", "Kickboxing", "Kickboxing", "🥊", "boxe pieds poings"],
  ["muay-thai", "Muay-thaï", "Muay Thai", "🥊", "boxe thai"],
  ["mma", "Arts martiaux mixtes (MMA)", "Mixed martial arts (MMA)", "🥊", "mma ufc combat libre"],
  ["savate", "Savate (boxe française)", "Savate (French boxing)", "🥊", "boxe francaise"],
  ["karate", "Karaté", "Karate", "🥋"],
  ["judo", "Judo", "Judo", "🥋"],
  ["taekwondo", "Taekwondo", "Taekwondo", "🥋", "tae kwon do"],
  ["bjj", "Jiu-jitsu brésilien", "Brazilian jiu-jitsu", "🥋", "bjj jujitsu jiu jitsu"],
  ["jujitsu", "Ju-jitsu", "Jujutsu", "🥋", "jujitsu traditionnel"],
  ["aikido", "Aïkido", "Aikido", "🥋"],
  ["kung-fu", "Kung-fu", "Kung fu", "🥋", "wushu"],
  ["hapkido", "Hapkido", "Hapkido", "🥋"],
  ["krav-maga", "Krav-maga", "Krav Maga", "🥋", "autodefense"],
  ["sambo", "Sambo", "Sambo", "🥋"],
  ["capoeira", "Capoeira", "Capoeira", "🤸"],
  ["kendo", "Kendo", "Kendo", "🤺", "sabre japonais"],
  ["fencing", "Escrime", "Fencing", "🤺", "epee fleuret sabre"],
  ["wrestling", "Lutte", "Wrestling", "🤼", "lutte olympique greco-romaine libre"],
  ["grappling", "Grappling", "Grappling", "🤼", "soumission"],
  ["sumo", "Sumo", "Sumo", "🤼"],
  ["arm-wrestling", "Bras de fer", "Arm wrestling", "💪", "tir au poignet"],

  // Course et athlétisme
  ["running", "Course à pied", "Running", "🏃", "jogging course"],
  ["track-and-field", "Athlétisme", "Track and field", "🏃", "piste"],
  ["sprint", "Sprint", "Sprint", "🏃", "100 m"],
  ["middle-distance", "Demi-fond", "Middle-distance running", "🏃", "800 m 1500 m"],
  ["marathon", "Marathon", "Marathon", "🏃", "demi-marathon"],
  ["ultramarathon", "Ultramarathon", "Ultramarathon", "🏃", "ultra trail"],
  ["trail-running", "Course en sentier", "Trail running", "🏃", "trail"],
  ["cross-country", "Cross-country", "Cross country running", "🏃", "cross"],
  ["hurdles", "Course de haies", "Hurdles", "🏃", "haies"],
  ["race-walking", "Marche athlétique", "Race walking", "🚶", "marche rapide"],
  ["high-jump", "Saut en hauteur", "High jump", "🏅"],
  ["long-jump", "Saut en longueur", "Long jump", "🏅"],
  ["triple-jump", "Triple saut", "Triple jump", "🏅"],
  ["pole-vault", "Saut à la perche", "Pole vault", "🏅", "perche"],
  ["shot-put", "Lancer du poids", "Shot put", "🏅", "poids"],
  ["discus", "Lancer du disque", "Discus throw", "🏅", "disque"],
  ["javelin", "Lancer du javelot", "Javelin throw", "🏅", "javelot"],
  ["hammer-throw", "Lancer du marteau", "Hammer throw", "🏅", "marteau"],
  ["decathlon", "Décathlon", "Decathlon", "🏅", "heptathlon epreuves combinees"],
  ["obstacle-racing", "Course à obstacles", "Obstacle course racing", "🧗", "spartan tough mudder"],
  ["orienteering", "Course d’orientation", "Orienteering", "🧭", "boussole carte"],
  ["triathlon", "Triathlon", "Triathlon", "🏊", "ironman"],
  ["duathlon", "Duathlon", "Duathlon", "🚴"],
  ["modern-pentathlon", "Pentathlon moderne", "Modern pentathlon", "🏅"],
  ["hiking", "Randonnée", "Hiking", "🥾", "rando marche en montagne"],
  ["walking", "Marche", "Walking", "🚶", "promenade"],
  ["nordic-walking", "Marche nordique", "Nordic walking", "🚶", "batons"],

  // Musculation, mise en forme et gymnastique
  ["strength-training", "Musculation", "Strength training", "💪", "gym salle poids muscu"],
  ["weightlifting", "Haltérophilie", "Weightlifting", "🏋️", "halterophilie arrache epaule-jete"],
  ["powerlifting", "Force athlétique", "Powerlifting", "🏋️", "powerlifting squat developpe couche souleve de terre"],
  ["bodybuilding", "Culturisme", "Bodybuilding", "💪", "bodybuilding"],
  ["crossfit", "CrossFit", "CrossFit", "🏋️", "entrainement fonctionnel wod"],
  ["strongman", "Hommes forts (strongman)", "Strongman", "🏋️", "homme fort"],
  ["calisthenics", "Callisthénie", "Calisthenics", "🤸", "street workout poids du corps"],
  ["hiit", "Entraînement HIIT", "HIIT", "💪", "intervalles"],
  ["yoga", "Yoga", "Yoga", "🧘"],
  ["pilates", "Pilates", "Pilates", "🧘"],
  ["aerobics", "Aérobie", "Aerobics", "💃", "aerobic"],
  ["zumba", "Zumba", "Zumba", "💃"],
  ["indoor-cycling", "Vélo stationnaire (spinning)", "Indoor cycling (spinning)", "🚴", "spinning"],
  ["jump-rope", "Corde à sauter", "Jump rope", "🪢", "saut a la corde"],
  ["gymnastics", "Gymnastique artistique", "Artistic gymnastics", "🤸", "gymnastique"],
  ["rhythmic-gymnastics", "Gymnastique rythmique", "Rhythmic gymnastics", "🤸"],
  ["trampoline", "Trampoline", "Trampoline", "🤸"],
  ["acrobatic-gymnastics", "Gymnastique acrobatique", "Acrobatic gymnastics", "🤸", "acrobatie"],
  ["tumbling", "Tumbling", "Tumbling", "🤸"],
  ["cheerleading", "Cheerleading", "Cheerleading", "📣", "meneuses de claques"],
  ["parkour", "Parkour", "Parkour", "🏃", "freerun"],
  ["circus-arts", "Arts du cirque", "Circus arts", "🎪", "tissu aerien trapeze jonglerie"],
  ["pole-fitness", "Danse à la barre (pole fitness)", "Pole fitness", "💃", "pole dance"],
  ["dance", "Danse", "Dance", "💃"],
  ["breaking", "Breakdance (breaking)", "Breaking (breakdance)", "🕺", "breakdance bboy"],
  ["dancesport", "Danse sportive", "DanceSport", "💃", "danse de salon"],
  ["ballet", "Ballet", "Ballet", "🩰", "danse classique"],

  // Escalade et montagne
  ["climbing", "Escalade", "Climbing", "🧗", "escalade sportive mur"],
  ["bouldering", "Escalade de bloc", "Bouldering", "🧗", "bloc"],
  ["mountaineering", "Alpinisme", "Mountaineering", "🏔️", "montagne"],
  ["ice-climbing", "Escalade de glace", "Ice climbing", "🧗", "cascade de glace"],
  ["slackline", "Slackline", "Slackline", "🪢"],
  ["canyoning", "Canyonisme", "Canyoning", "🏞️", "canyon"],
  ["caving", "Spéléologie", "Caving", "🔦", "grotte"],

  // Vélo
  ["cycling", "Cyclisme sur route", "Road cycling", "🚴", "velo route"],
  ["mountain-biking", "Vélo de montagne", "Mountain biking", "🚵", "vtt velo de montagne"],
  ["bmx", "BMX", "BMX", "🚲"],
  ["track-cycling", "Cyclisme sur piste", "Track cycling", "🚴", "velodrome"],
  ["cyclocross", "Cyclocross", "Cyclocross", "🚴"],
  ["gravel-cycling", "Vélo gravel", "Gravel cycling", "🚴", "gravel"],
  ["fat-bike", "Vélo à pneus surdimensionnés (fatbike)", "Fat biking", "🚲", "fatbike velo d'hiver"],

  // Sports aquatiques
  ["swimming", "Natation", "Swimming", "🏊", "nage piscine"],
  ["open-water-swimming", "Nage en eau libre", "Open water swimming", "🏊", "eau libre"],
  ["diving", "Plongeon", "Diving", "🏊", "plongeoir tremplin"],
  ["artistic-swimming", "Nage artistique", "Artistic swimming", "🏊", "nage synchronisee"],
  ["scuba-diving", "Plongée sous-marine", "Scuba diving", "🤿", "plongee"],
  ["freediving", "Apnée", "Freediving", "🤿"],
  ["lifesaving", "Sauvetage sportif", "Lifesaving sport", "🛟", "sauveteur"],
  ["surfing", "Surf", "Surfing", "🏄"],
  ["bodyboarding", "Bodyboard", "Bodyboarding", "🏄"],
  ["paddleboarding", "Planche à pagaie (SUP)", "Stand-up paddleboarding (SUP)", "🏄", "sup paddle board"],
  ["kitesurfing", "Kitesurf", "Kitesurfing", "🪁", "cerf-volant de traction"],
  ["windsurfing", "Planche à voile", "Windsurfing", "🏄", "windsurf"],
  ["wakeboarding", "Planche nautique (wakeboard)", "Wakeboarding", "🏄", "wakeboard wakesurf"],
  ["water-skiing", "Ski nautique", "Water skiing", "🎿"],
  ["sailing", "Voile", "Sailing", "⛵", "voilier regate"],
  ["rowing", "Aviron", "Rowing", "🚣"],
  ["canoeing", "Canot", "Canoeing", "🛶", "canoe"],
  ["kayaking", "Kayak", "Kayaking", "🛶"],
  ["whitewater-rafting", "Rafting en eaux vives", "Whitewater rafting", "🛶", "rafting eaux vives"],
  ["dragon-boat", "Bateau-dragon", "Dragon boat", "🐉"],
  ["jet-skiing", "Motomarine", "Jet skiing", "🚤", "sea-doo"],
  ["powerboating", "Motonautisme", "Powerboat racing", "🚤", "bateau a moteur"],
  ["sport-fishing", "Pêche sportive", "Sport fishing", "🎣", "peche"],

  // Sports d'hiver
  ["alpine-skiing", "Ski alpin", "Alpine skiing", "⛷️", "ski descente"],
  ["cross-country-skiing", "Ski de fond", "Cross-country skiing", "🎿", "ski nordique"],
  ["ski-touring", "Ski de randonnée alpine", "Ski touring", "🎿", "ski hors-piste peaux de phoque"],
  ["freestyle-skiing", "Ski acrobatique", "Freestyle skiing", "⛷️", "ski freestyle bosses"],
  ["ski-jumping", "Saut à ski", "Ski jumping", "🎿"],
  ["nordic-combined", "Combiné nordique", "Nordic combined", "🎿"],
  ["snowboarding", "Planche à neige", "Snowboarding", "🏂", "snowboard"],
  ["ice-skating", "Patinage", "Ice skating", "⛸️", "patin"],
  ["figure-skating", "Patinage artistique", "Figure skating", "⛸️"],
  ["speed-skating", "Patinage de vitesse", "Speed skating", "⛸️"],
  ["short-track", "Patinage de vitesse sur courte piste", "Short track speed skating", "⛸️", "courte piste"],
  ["bobsleigh", "Bobsleigh", "Bobsleigh", "🛷", "bobsled"],
  ["luge", "Luge", "Luge", "🛷"],
  ["skeleton", "Skeleton", "Skeleton", "🛷"],
  ["snowshoeing", "Raquette", "Snowshoeing", "🥾", "raquettes a neige"],
  ["snowmobiling", "Motoneige", "Snowmobiling", "🛷", "skidoo"],
  ["dog-sledding", "Traîneau à chiens", "Dog sledding", "🐕", "chiens de traineau"],
  ["ice-fishing", "Pêche sur glace", "Ice fishing", "🎣", "peche blanche"],

  // Glisse sur roues
  ["skateboarding", "Planche à roulettes", "Skateboarding", "🛹", "skate"],
  ["longboarding", "Longboard", "Longboarding", "🛹"],
  ["inline-skating", "Patin à roues alignées", "Inline skating", "🛼", "roller rollerblade"],
  ["roller-derby", "Roller derby", "Roller derby", "🛼"],
  ["scooter", "Trottinette", "Scooter riding", "🛴", "trottinette freestyle"],

  // Sports motorisés
  ["formula-1", "Formule 1", "Formula 1", "🏎️", "f1 grand prix"],
  ["auto-racing", "Course automobile", "Auto racing", "🏎️", "nascar indycar"],
  ["karting", "Karting", "Karting", "🏎️", "kart"],
  ["rally", "Rallye", "Rally", "🚗"],
  ["motocross", "Motocross", "Motocross", "🏍️", "supercross"],
  ["motorcycle-racing", "Course de moto", "Motorcycle racing", "🏍️", "motogp"],
  ["drone-racing", "Course de drones", "Drone racing", "🛸"],

  // Équitation
  ["horse-riding", "Équitation", "Horse riding", "🏇", "cheval"],
  ["show-jumping", "Saut d’obstacles", "Show jumping", "🏇"],
  ["dressage", "Dressage", "Dressage", "🏇"],
  ["eventing", "Concours complet", "Eventing", "🏇"],
  ["horse-racing", "Courses hippiques", "Horse racing", "🏇", "courses de chevaux"],
  ["rodeo", "Rodéo", "Rodeo", "🤠"],

  // Sports aériens et sensations
  ["skydiving", "Parachutisme", "Skydiving", "🪂", "parachute"],
  ["paragliding", "Parapente", "Paragliding", "🪂"],
  ["hang-gliding", "Deltaplane", "Hang gliding", "🪂"],
  ["base-jumping", "BASE jump", "BASE jumping", "🪂"],
  ["gliding", "Vol à voile", "Gliding", "✈️", "planeur"],
  ["bungee-jumping", "Saut à l’élastique", "Bungee jumping", "🪢", "bungee"],
  ["sport-kite", "Cerf-volant sportif", "Sport kite flying", "🪁", "cerf-volant"],

  // Sports de l'esprit et autres
  ["chess", "Échecs", "Chess", "♟️"],
  ["esports", "Sports électroniques", "Esports", "🎮", "jeux video esport gaming"],
  ["hunting", "Chasse", "Hunting", "🦌"],
  ["tug-of-war", "Tir à la corde", "Tug of war", "🪢"],
];

export type Sport = { id: string; fr: string; en: string; emoji: string; search: string };

// Texte sans accents ni majuscules, pour que « eSCRime », « escrime » et « éscrime » donnent le même résultat
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`-]/g, " ")
    .trim();
}

export const SPORTS: Sport[] = SPORT_ROWS.map(([id, fr, en, emoji, keywords = ""]) => ({
  id,
  fr,
  en,
  emoji,
  search: normalizeSearch(`${fr} ${en} ${keywords}`),
}));

const BY_ID = new Map(SPORTS.map((sport) => [sport.id, sport]));

export function getSport(id: string): Sport | undefined {
  return BY_ID.get(id);
}

export function sportName(sport: Sport, language: Language): string {
  return language === "en" ? sport.en : sport.fr;
}

// Suggestions quand la recherche est vide : les sports les plus pratiqués ici
export const POPULAR_SPORT_IDS = [
  "hockey",
  "soccer",
  "basketball",
  "football",
  "baseball",
  "volleyball",
  "tennis",
  "pickleball",
  "running",
  "cycling",
  "swimming",
  "golf",
  "alpine-skiing",
  "snowboarding",
  "badminton",
  "strength-training",
];

export const MAX_SPORTS = 10;

// Recherche : les sports dont un mot commence par la recherche passent en premier, puis ceux qui la contiennent
export function searchSports(query: string, language: Language, limit = 30): Sport[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const scored: { sport: Sport; score: number }[] = [];
  for (const sport of SPORTS) {
    const name = normalizeSearch(sportName(sport, language));
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(/\s+/).some((word) => word.startsWith(q))) score = 2;
    else if (sport.search.split(/\s+/).some((word) => word.startsWith(q))) score = 3;
    // Recherche à l'intérieur des mots seulement à partir de 5 lettres (sinon « ping » trouverait « jumping »)
    else if (q.length >= 5 && sport.search.includes(q)) score = 4;
    if (score >= 0) scored.push({ sport, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || sportName(a.sport, language).localeCompare(sportName(b.sport, language)))
    .slice(0, limit)
    .map((entry) => entry.sport);
}
