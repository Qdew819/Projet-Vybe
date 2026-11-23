"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell, { useOpenCreateSheet } from "../../components/AppShell";
import EventMiniCard from "../../components/home/EventMiniCard";
import PostCard from "../../components/home/PostCard";
import VideoCard from "../../components/home/VideoCard";
import { SHOW_HOME_PREVIEW, previewEvent, previewPost, previewVideos } from "../../lib/home-preview";
import { useT } from "../../lib/i18n";
import { isLanguage, setLanguage } from "../../lib/language";
import { createClient } from "../../lib/supabase/client";
import { isThemeChoice, setTheme } from "../../lib/theme";
import { fetchCatalog, loadMySports, withDetails, type UserSport } from "../../lib/userSports";

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

// Bannière de l'en-tête (public/accueil-banniere.jpg, 1122 × 440) : le logo fait partie du décor (traînées et
// fissures vertes jusqu'aux bords, tirées de accueil-vybe.jpg), un peu à gauche du centre. Seul le bas s'efface.
const BANNER_MASK = "linear-gradient(to bottom, black 50%, rgba(0,0,0,0.6) 75%, transparent 100%)";
// Fond derrière le bas de la bannière : vert foncé qui se fond dans le fond de la page
const HEADER_FADE = "linear-gradient(to bottom, #000 0%, #0b330d 55%, var(--background) 100%)";

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function Accueil() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [sports, setSports] = useState<UserSport[]>([]);
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

      // Profil pas encore rempli (aucune ligne ou pas de date de naissance) : on passe par la création du profil.
      // En cas d'erreur de lecture, on affiche quand même l'accueil plutôt que de bloquer la personne.
      const uid = data.user.id;
      const { data: profile, error } = await supabase.from("profiles").select("birth_date").eq("id", uid).maybeSingle();
      if (error) {
        console.error(
          `Lecture du profil impossible : ${error.message} (code ${error.code})` +
            (error.details ? ` — ${error.details}` : "") +
            (error.hint ? ` — ${error.hint}` : "")
        );
      }
      if (!error && !profile?.birth_date) {
        router.replace("/profil/creer");
        return;
      }

      // Lus en parallèle : si l'un échoue, le reste de l'accueil s'affiche quand même
      const [pendingResult, locationResult, sportsResult] = await Promise.all([
        // Demandes d'abonnement en attente : seulement le nombre, pour la pastille de la cloche
        supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("followed_id", uid)
          .eq("status", "pending"),
        supabase.from("user_locations").select("user_id").eq("user_id", uid).maybeSingle(),
        Promise.all([loadMySports(supabase, uid), fetchCatalog(supabase)]).then(
          ([choices, catalog]) => ({ data: withDetails(choices, catalog), error: null }),
          (err: unknown) => ({ data: null, error: err })
        ),
      ]);

      if (pendingResult.error) {
        console.error(`Lecture des demandes d'abonnement impossible : ${pendingResult.error.message} (code ${pendingResult.error.code})`);
      } else {
        setPendingRequests(pendingResult.count ?? 0);
      }
      // Pas encore de ville : bannière (rien n'est affiché si la lecture échoue)
      if (locationResult.error) {
        console.error(`Lecture de la ville impossible : ${locationResult.error.message} (code ${locationResult.error.code})`);
      } else {
        setShowCityBanner(!locationResult.data && !cityBannerHidden());
      }
      if (sportsResult.error || !sportsResult.data) {
        console.error("Lecture des sports impossible :", sportsResult.error);
      } else {
        setSports(sportsResult.data);
      }
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Boutons d'exemple : rien ne se passe, on annonce « Bientôt ».
  // Le texte alterne avec une espace insécable pour être annoncé de nouveau à chaque clic.
  const soon = useCallback(() => {
    const text = t("common.soon");
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }, [t]);

  if (!ready) {
    return (
      <AppShell active="accueil">
        <h1 className="sr-only">{t("home.title")}</h1>
        <div role="status" className="flex flex-1 items-center justify-center text-muted">
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  const bellLabel =
    pendingRequests > 0
      ? `${t("home.notifications")} (${t("home.pendingBadge").replace("{n}", String(pendingRequests))})`
      : t("home.notifications");

  return (
    <AppShell active="accueil">
      <h1 className="sr-only">{t("home.title")}</h1>

      {/* En-tête comme la maquette : bannière sur toute la largeur (logo intégré au décor), recherche et cloche
          en blanc à droite. Le bas de la bannière se fond dans la page */}
      <header className="relative" style={{ background: HEADER_FADE }}>
        {logoFailed ? (
          <p className="flex aspect-[1122/440] items-center justify-center select-none text-5xl font-black italic leading-none tracking-tight text-white">
            VYBE
          </p>
        ) : (
          <Image
            src="/accueil-banniere.jpg"
            alt="Vybe"
            width={1122}
            height={440}
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 500px) 100vw, 500px"
            onError={() => setLogoFailed(true)}
            className="block h-auto w-full"
            style={{ maskImage: BANNER_MASK, WebkitMaskImage: BANNER_MASK }}
          />
        )}

        <div className="absolute right-2 top-[28%] z-10 flex -translate-y-1/2 items-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          <HeaderIcon href="/personnes" label={t("home.search")}>
            <svg {...iconProps} viewBox="0 0 24 24" className="h-6 w-6" strokeWidth={2.2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </HeaderIcon>
          <HeaderIcon href="/personnes" label={bellLabel}>
            <svg {...iconProps} viewBox="0 0 24 24" className="h-6 w-6" strokeWidth={2.2}>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {pendingRequests > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-black bg-accent px-1 text-[10px] font-black leading-none text-on-accent"
              >
                {pendingRequests > 9 ? "9+" : pendingRequests}
              </span>
            )}
          </HeaderIcon>
        </div>
      </header>

      {/* Raccourcis ronds (défilement horizontal), juste sous l'en-tête */}
      <nav aria-label={t("home.shortcuts")} className="relative z-10 -mt-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max gap-3 px-4 pb-1 pt-1">
          <li>
            <PublishShortcut label={t("create.post")} />
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
            sports.map(({ sport }) => (
              <li key={sport.id}>
                <Shortcut href="/evenements" label={sport.name}>
                  <span aria-hidden="true" className="text-[28px] leading-none">
                    {sport.emoji}
                  </span>
                </Shortcut>
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

      {/* Faux champ de recherche : le vrai champ est sur la page Communauté */}
      <div className="mt-4 px-4">
        <Link
          href="/personnes"
          className="flex h-12 items-center gap-3 rounded-full border border-line bg-surface px-4 text-sm text-muted transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <svg {...iconProps} viewBox="0 0 24 24" className="h-5 w-5 shrink-0" strokeWidth={2.2}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {t("home.searchPlaceholder")}
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

      {SHOW_HOME_PREVIEW && (
        <>
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
            <div className="px-4">
              <EventMiniCard {...previewEvent} onRegister={soon} inactive />
            </div>
          </Section>

          <div className="mt-6 px-4">
            <PostCard {...previewPost} onLike={soon} onComment={soon} onShare={soon} onPlay={soon} inactive />
          </div>

          <Section
            id="videos-populaires"
            title={t("home.popularVideos")}
            icon={
              <svg {...iconProps} viewBox="0 0 24 24" className="h-5 w-5" strokeWidth={2.2}>
                <path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" />
              </svg>
            }
          >
            <ul className="flex w-max gap-3 px-4">
              {previewVideos.map((video) => (
                <li key={video.id}>
                  <VideoCard title={video.title} media={video.media} duration={video.duration} onPlay={soon} inactive />
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {/* Annonce « Bientôt » : lue par les lecteurs d'écran et affichée au-dessus de la barre du bas */}
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
function HeaderIcon({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </Link>
  );
}

const circle =
  "flex h-16 w-16 items-center justify-center rounded-full border-2 bg-surface shadow-[0_0_12px_rgba(57,255,20,0.25)] transition-colors";
const shortcutBase =
  "group flex w-[72px] flex-col items-center gap-1.5 rounded-2xl text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

function Shortcut({ href, label, dashed = false, children }: { href: string; label: string; dashed?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={shortcutBase}>
      <span className={`${circle} ${dashed ? "border-dashed border-accent-ink" : "border-accent"} group-hover:border-accent-ink`}>
        {children}
      </span>
      <span className="w-full truncate text-[11px] font-semibold leading-tight">{label}</span>
    </Link>
  );
}

// « Publier » ouvre la même feuille que le bouton « + » de la barre du bas
function PublishShortcut({ label }: { label: string }) {
  const openCreate = useOpenCreateSheet();
  return (
    <button type="button" onClick={openCreate} aria-haspopup="dialog" className={shortcutBase}>
      <span className={`${circle} border-accent`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="w-full truncate text-[11px] font-semibold leading-tight">{label}</span>
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
