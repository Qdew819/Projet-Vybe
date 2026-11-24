"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Avatar from "../../components/Avatar";
import NotificationBell from "../../components/NotificationBell";
import HomeEvents from "../../components/home/HomeEvents";
import PostFeed from "../../components/home/PostFeed";
import PopularVideos from "../../components/home/PopularVideos";
import { useT } from "../../lib/i18n";
import { isLanguage, setLanguage } from "../../lib/language";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { isThemeChoice, setTheme } from "../../lib/theme";
import { findSportOption, toSportOption, toSportOptions, type SportOption } from "../../lib/sportOptions";
import { fetchCatalog, loadMySports, withDetails } from "../../lib/userSports";

// Bannière « Ajoute ta ville » masquée pendant 7 jours après un clic sur ×
const CITY_BANNER_KEY = "vybe.cityBannerHiddenUntil";
const CITY_BANNER_HIDE_MS = 7 * 24 * 60 * 60 * 1000;

function cityBannerHidden(): boolean {
  try {
    const until = Number(window.localStorage.getItem(CITY_BANNER_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function hideCityBanner() {
  try {
    window.localStorage.setItem(CITY_BANNER_KEY, String(Date.now() + CITY_BANNER_HIDE_MS));
  } catch {
    // Stockage indisponible (navigation privée…) : la bannière est masquée jusqu'au prochain chargement
  }
}

// Bannière de l'en-tête (public/accueil-banniere.jpg, 2000 × 420) : le logo fait partie du décor (traînées et
// fissures vertes jusqu'aux bords, tirées de accueil-vybe.jpg), un peu à gauche du centre. Seul le bas s'efface.
const BANNER_MASK = "linear-gradient(to bottom, black 62%, rgba(0,0,0,0.6) 82%, transparent 100%)";
// Fond derrière le bas de la bannière : vert foncé qui se fond dans le fond de la page
// (noir puis vert foncé en mode sombre, blanc puis vert pâle en mode clair : voir globals.css)
const HEADER_FADE = "linear-gradient(to bottom, var(--header-start) 0%, var(--header-mid) 55%, var(--background) 100%)";

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// useSearchParams (filtre ?sport=) doit être lu à l'intérieur d'un <Suspense>
export default function Accueil() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <AccueilContent />
    </Suspense>
  );
}

function HomeLoading() {
  const t = useT();
  return (
    <AppShell active="accueil">
      <h1 className="sr-only">{t("home.title")}</h1>
      <div role="status" className="flex flex-1 items-center justify-center text-muted">
        {t("common.loading")}
      </div>
    </AppShell>
  );
}

function AccueilContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  // Ma photo et mon nom, pour la barre « Quoi de neuf ? »
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  // Icône de sport choisie : filtre les vidéos populaires et le fil. Gardée dans l'adresse (/accueil?sport=hockey) :
  // elle reste après un rafraîchissement et le lien est partageable. Valeur = posts.sport (lib/sportOptions.ts).
  const sportFilter = searchParams.get("sport") || null;
  // Mes sports (icônes) et tout le catalogue (nom d'un sport venu d'un lien partagé qui n'est pas dans mes sports)
  const [sports, setSports] = useState<SportOption[]>([]);
  const [catalog, setCatalog] = useState<SportOption[]>([]);
  const [showCityBanner, setShowCityBanner] = useState(false);
  // L'image du logo n'a pas pu être chargée : on affiche « VYBE » en texte à la place
  const [logoFailed, setLogoFailed] = useState(false);
  // Message « Bientôt » des boutons d'exemple : annoncé (aria-live) et affiché brièvement
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const meta = data.user.user_metadata ?? {};

      // Affichage ou langue pas encore choisi : on passe par l'écran des préférences
      if (!isThemeChoice(meta.theme) || !isLanguage(meta.language)) {
        router.replace("/bienvenue");
        return;
      }
      setTheme(meta.theme);
      setLanguage(meta.language);

      // Profil pas encore créé (aucune ligne ou pas de nom d'utilisateur) : on passe par la création du profil.
      // La date de naissance est vérifiée à part (private_profiles), par BirthDateGate dans app/template.tsx.
      // En cas d'erreur de lecture, on affiche quand même l'accueil plutôt que de bloquer la personne.
      const uid = data.user.id;
      setUserId(uid);
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("avatar_url, display_name, username")
        .eq("id", uid)
        .maybeSingle();
      if (error) {
        console.error(
          `Lecture du profil impossible : ${error.message} (code ${error.code})` +
            (error.details ? ` — ${error.details}` : "") +
            (error.hint ? ` — ${error.hint}` : "")
        );
      }
      if (!error && !profile?.username) {
        router.replace("/profil/creer");
        return;
      }
      setMyAvatar(typeof profile?.avatar_url === "string" && profile.avatar_url ? profile.avatar_url : null);
      setMyName(String(profile?.display_name || profile?.username || ""));

      // Lus en parallèle : si l'un échoue, le reste de l'accueil s'affiche quand même
      const [locationResult, sportsResult] = await Promise.all([
        supabase.from("user_locations").select("user_id").eq("user_id", uid).maybeSingle(),
        Promise.all([loadMySports(supabase, uid), fetchCatalog(supabase)]).then(
          ([choices, all]) => ({
            data: { mine: withDetails(choices, all).map(({ sport }) => toSportOption(sport)), all: toSportOptions(all) },
            error: null,
          }),
          (err: unknown) => ({ data: null, error: err })
        ),
      ]);

      // Pas encore de ville : bannière (rien n'est affiché si la lecture échoue)
      if (locationResult.error) {
        console.error(`Lecture de la ville impossible : ${locationResult.error.message} (code ${locationResult.error.code})`);
      } else {
        setShowCityBanner(!locationResult.data && !cityBannerHidden());
      }
      if (sportsResult.error || !sportsResult.data) {
        console.error("Lecture des sports impossible :", sportsResult.error);
      } else {
        setSports(sportsResult.data.mine);
        setCatalog(sportsResult.data.all);
      }
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Message bref au-dessus de la barre du bas (annoncé aux lecteurs d'écran).
  // Le texte alterne avec une espace insécable pour être annoncé de nouveau à chaque fois.
  const announce = useCallback((text: string) => {
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);

  // Choisit le sport du filtre (null : tous les sports) en gardant les autres paramètres de l'adresse
  const setSportFilter = useCallback(
    (value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("sport", value);
      else params.delete("sport");
      const query = params.toString();
      router.replace(query ? `/accueil?${query}` : "/accueil", { scroll: false });
    },
    [router, searchParams]
  );
  const activeSport = findSportOption(sports, sportFilter) ?? findSportOption(catalog, sportFilter);
  const sportLabel = activeSport?.label ?? sportFilter ?? "";

  // Retour du formulaire de publication (?publie=1) : « Publié ! », puis on nettoie l'adresse.
  // Le fil est relu à l'arrivée sur l'accueil : la nouvelle publication est en haut.
  useEffect(() => {
    if (!ready || !new URLSearchParams(window.location.search).get("publie")) return;
    // Dans un rappel, une fois l'accueil affiché (l'adresse est nettoyée au même moment : si React relance
    // l'effet en développement, le premier rappel est annulé et le second voit encore ?publie=1)
    const timer = setTimeout(() => {
      // Seul ?publie est retiré : le filtre ?sport reste
      const params = new URLSearchParams(window.location.search);
      params.delete("publie");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
      announce(t("publish.done"));
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, announce, t]);

  if (!ready) return <HomeLoading />;

  return (
    <AppShell active="accueil">
      <h1 className="sr-only">{t("home.title")}</h1>

      {/* En-tête comme la maquette : bannière sur toute la largeur (logo intégré au décor), recherche et cloche
          en blanc à droite. Le bas de la bannière se fond dans la page */}
      <header className="relative" style={{ background: HEADER_FADE }}>
        {logoFailed ? (
          <p className="flex aspect-[2000/420] items-center justify-center select-none text-3xl font-black italic leading-none tracking-tight text-white light:text-foreground">
            VYBE
          </p>
        ) : (
          <Image
            src="/accueil-banniere.jpg"
            alt="Vybe"
            width={2000}
            height={420}
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 500px) 100vw, 500px"
            onError={() => setLogoFailed(true)}
            // En mode clair, le fond noir de la photo devient blanc (couleurs gardées à peu près)
            className="block h-auto w-full light:[filter:invert(1)_hue-rotate(180deg)]"
            style={{ maskImage: BANNER_MASK, WebkitMaskImage: BANNER_MASK }}
          />
        )}

        <div className="absolute right-2 top-[40%] z-10 flex -translate-y-1/2 items-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] light:drop-shadow-none">
          <HeaderIcon href="/recherche" label={t("home.search")}>
            <svg {...iconProps} viewBox="0 0 24 24" className="h-6 w-6" strokeWidth={2.2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </HeaderIcon>
          {/* Vraies notifications non lues, en temps réel (components/NotificationBell.tsx) */}
          <NotificationBell userId={userId} className={headerIconClass} />
        </div>
      </header>

      {/* Raccourcis ronds (défilement horizontal), remontés sur le bas de la bannière : le haut des cercles est à
          environ 3 mm (17 px) sous le bas de la cloche, quelle que soit la largeur de l'écran.
          Bannière H = largeur × 420/2000 ; bas de la cloche = 0,4 H + 12 px ; haut des cercles = H − marge + 4 px
          → marge = 0,6 H − 25 px = largeur × 0,126 − 25 px */}
      <nav
        aria-label={t("home.shortcuts")}
        className="relative z-10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ marginTop: "calc(25px - min(100vw, 500px) * 0.126)" }}
      >
        <ul className="flex w-max gap-3 px-4 pb-1 pt-1">
          <li>
            <Shortcut href="/publier" label={t("create.post")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Shortcut>
          </li>
          <li>
            <Shortcut href="/evenements" label={t("nav.events")}>
              <svg {...iconProps} viewBox="0 0 24 24" className="h-7 w-7 text-accent-ink" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 10h18" />
                <path d="M8 14h2M14 14h2M8 17.5h2" />
              </svg>
            </Shortcut>
          </li>
          {sports.length > 0 ? (
            sports.map((sport) => (
              <li key={sport.id}>
                {/* Un clic filtre l'accueil sur ce sport (une seule icône active) ; un 2e clic retire le filtre */}
                <SportFilterShortcut
                  label={sport.label}
                  image={sport.image}
                  selected={sportFilter === sport.value}
                  onClick={() => setSportFilter(sportFilter === sport.value ? null : sport.value)}
                >
                  <span aria-hidden="true" className="text-[28px] leading-none">
                    {sport.emoji}
                  </span>
                </SportFilterShortcut>
              </li>
            ))
          ) : (
            <li>
              <Shortcut href="/parametres/sports" label={t("home.addSport")} dashed>
                <svg {...iconProps} viewBox="0 0 24 24" className="h-7 w-7 text-accent-ink" strokeWidth={2.4}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Shortcut>
            </li>
          )}
        </ul>
      </nav>

      {/* « Quoi de neuf ? » : ouvre le formulaire de publication (la recherche de personnes est sur la loupe en haut) */}
      <div className="mt-4 px-4">
        <Link
          href="/publier"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <Avatar src={myAvatar} initial={initialsOf(myName || "?")} alt="" size={40} />
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{t("feed.whatsNew")}</span>
          <svg {...iconProps} viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-accent-ink" strokeWidth={2}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.8" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
        </Link>
      </div>

      {/* Pas encore de ville : mince bannière, masquable 7 jours */}
      {showCityBanner && (
        <div className="mx-4 mt-4 flex items-center gap-1 rounded-xl border border-accent-ink/40 bg-surface pl-3">
          <Link
            href="/profil/ville"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg {...iconProps} viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent-ink" strokeWidth={2.2}>
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="min-w-0">{t("location.homeCard")}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              hideCityBanner();
              setShowCityBanner(false);
            }}
            aria-label={t("home.dismissCity")}
            title={t("home.dismissCity")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg {...iconProps} viewBox="0 0 24 24" className="h-4 w-4" strokeWidth={2.5}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {/* Vrais événements : 3 au maximum, les plus proches de la personne en premier */}
      <Section
        id="evenements-pres"
        title={t("home.eventsNear")}
        seeAllHref="/evenements"
        icon={
          <svg {...iconProps} viewBox="0 0 24 24" className="h-5 w-5" strokeWidth={2.2}>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        }
      >
        <HomeEvents userId={userId} onMessage={announce} />
      </Section>

      {/* Filtre actif (cercle de sport choisi en haut) : pastille pour le retirer */}
      {sportFilter && (
        <div className="mt-6 flex px-4">
          <button
            type="button"
            onClick={() => setSportFilter(null)}
            aria-label={t("feed.removeFilter").replace("{sport}", sportLabel)}
            className="flex min-h-10 items-center gap-2 rounded-full border-2 border-accent-ink bg-accent-ink/10 px-4 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {activeSport?.emoji && <span aria-hidden="true">{activeSport.emoji}</span>}
            {sportLabel}
            <svg {...iconProps} viewBox="0 0 24 24" className="h-4 w-4" strokeWidth={3}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      <PostFeed
        me={userId}
        sport={sportFilter}
        sportLabel={sportLabel}
        onClearSport={() => setSportFilter(null)}
        onMessage={announce}
      />

      {/* Vraies vidéos populaires (filtrées par l'icône de sport choisie) ; sans filtre, section masquée s'il n'y en a aucune */}
      <PopularVideos
        sport={sportFilter}
        sportLabel={sportLabel}
        wrap={(content) => (
          <Section
            id="videos-populaires"
            title={t("home.popularVideos")}
            seeAllHref={sportFilter ? `/videos?sport=${encodeURIComponent(sportFilter)}` : "/videos"}
            icon={
              <svg {...iconProps} viewBox="0 0 24 24" className="h-5 w-5" strokeWidth={2.2}>
                <path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" />
              </svg>
            }
          >
            {content}
          </Section>
        )}
      />

      {/* Messages brefs : lus par les lecteurs d'écran et affichée au-dessus de la barre du bas */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
      >
        {toast && (
          <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>
        )}
      </div>
    </AppShell>
  );
}

// Icône blanche simple comme la maquette (l'en-tête reste noir dans les deux thèmes), zone tactile de 44 px
const headerIconClass =
  "relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:text-accent light:text-foreground light:hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent";

function HeaderIcon({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={headerIconClass}
    >
      {children}
    </Link>
  );
}

const circle =
  "flex h-16 w-16 items-center justify-center rounded-full border-2 bg-surface shadow-[0_0_12px_rgba(57,255,20,0.25)] transition-colors";
const shortcutBase =
  "group flex w-[72px] flex-col items-center gap-1.5 rounded-2xl text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

// Raccourci rond : photo du sport (avec son propre anneau vert) si elle existe, sinon le contenu (émoji, icône)
function Shortcut({
  href,
  label,
  dashed = false,
  image = null,
  children,
}: {
  href: string;
  label: string;
  dashed?: boolean;
  image?: string | null;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={shortcutBase}>
      {image ? (
        <span className="relative block h-16 w-16 overflow-hidden rounded-full shadow-[0_0_12px_rgba(57,255,20,0.35)] transition-transform group-hover:scale-105">
          {/* Décorative : le nom du sport est écrit dessous */}
          <Image src={image} alt="" fill sizes="64px" className="object-cover" />
        </span>
      ) : (
        <span className={`${circle} ${dashed ? "border-dashed border-accent-ink" : "border-accent"} group-hover:border-accent-ink`}>
          {children}
        </span>
      )}
      <span className="w-full truncate text-[11px] font-semibold leading-tight">{label}</span>
    </Link>
  );
}

// Icône de sport : filtre l'accueil. Active : anneau vert néon et lueur, nom en vert néon (accent-ink = #39ff14 en
// mode sombre ; plus foncé en mode clair pour rester lisible sur fond blanc)
function SportFilterShortcut({
  label,
  image,
  selected,
  onClick,
  children,
}: {
  label: string;
  image: string | null;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const ring = selected ? "ring-4 ring-accent ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(57,255,20,0.8)]" : "";
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={shortcutBase}>
      {image ? (
        <span className={`relative block h-16 w-16 overflow-hidden rounded-full transition-transform group-hover:scale-105 ${ring || "shadow-[0_0_12px_rgba(57,255,20,0.35)]"}`}>
          <Image src={image} alt="" fill sizes="64px" className="object-cover" />
        </span>
      ) : (
        <span className={`${circle} border-accent group-hover:border-accent-ink ${ring}`}>{children}</span>
      )}
      <span className={`w-full truncate text-[11px] leading-tight ${selected ? "font-black text-accent-ink" : "font-semibold"}`}>{label}</span>
    </button>
  );
}

function Section({
  id,
  title,
  icon,
  seeAllHref,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  seeAllHref?: string; // lien « Voir tout » (absent s'il n'y a pas encore de page)
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section aria-labelledby={`${id}-titre`} className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <h2 id={`${id}-titre`} className="flex items-center gap-2 text-base font-bold">
          <span className="text-accent-ink">{icon}</span>
          {title}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            aria-label={t("home.seeAllOf").replace("{title}", title)}
            className="flex min-h-11 items-center text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            {t("home.seeAll")}
          </Link>
        )}
      </div>
      {/* La rangée de vidéos défile horizontalement ; le reste garde sa largeur */}
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    </section>
  );
}
