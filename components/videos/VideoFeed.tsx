"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommentsSheet from "./CommentsSheet";
import ReelItem, { ReelSkeleton } from "./ReelItem";
import type { FollowStatus } from "../../lib/follows";
import { useT } from "../../lib/i18n";
import type { PostRow, PostStats } from "../../lib/posts";
import { createClient } from "../../lib/supabase/client";
import { useSportsCatalog } from "../../lib/userSports";
import { fetchNextReels, loadReels, newCursor, type FeedCursor, type FeedTab, type Reel } from "../../lib/videoFeed";

// ---------- Son du fil : choix mémorisé pour la session ----------

const SOUND_KEY = "vybe.reelsSound"; // « on » | « off » ; rien : on essaie avec le son
const soundListeners = new Set<() => void>();

function readSound(): boolean {
  try {
    return window.sessionStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeSound(on: boolean) {
  try {
    window.sessionStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Stockage indisponible : le choix vaut jusqu'au rechargement
  }
  soundListeners.forEach((listener) => listener());
}
function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  return () => soundListeners.delete(listener);
}

const VISIBLE_RATIO = 0.7;
const LOAD_AHEAD = 3; // charge la suite quand il reste 3 vidéos
const WHEEL_LOCK_MS = 650;

type Phase = "loading" | "error" | "ready";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Fil de vidéos plein écran façon Reels : une vidéo par écran, défilement aimanté, lecture automatique de la vidéo
// visible à plus de 70 %. Seules la vidéo courante, la précédente et les deux suivantes sont montées.
// sport : filtre venu de l'accueil (/videos?sport=<valeur>), null : tous les sports
export default function VideoFeed({ startId, sport: sportFilter = null }: { startId: string | null; sport?: string | null }) {
  const router = useRouter();
  const t = useT();
  const { state: catalog } = useSportsCatalog();
  const soundWanted = useSyncExternalStore(subscribeSound, readSound, () => true);

  const [me, setMe] = useState("");
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [reels, setReels] = useState<Reel[]>([]);
  const [done, setDone] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [startPoster, setStartPoster] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [commentsFor, setCommentsFor] = useState<PostRow | null>(null);
  const [toast, setToast] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<FeedCursor | null>(null);
  const loadingRef = useRef(false);
  const activeRef = useRef(0);
  const wheelLock = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const soundOn = soundWanted && !soundBlocked;

  const announce = useCallback((text: string) => {
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) router.replace("/connexion");
        else setMe(data.user.id);
      });
  }, [router]);

  // Lot suivant pour le curseur donné (ignoré si l'onglet a changé entre-temps)
  const loadMore = useCallback(
    async (cursor: FeedCursor) => {
      if (loadingRef.current || cursor.done || !me) return;
      loadingRef.current = true;
      const supabase = createClient();
      try {
        let posts: PostRow[] = [];
        // Un lot peut être vide si tout a déjà été vu : on continue (quelques fois au plus)
        for (let tries = 0; tries < 3 && posts.length === 0 && !cursor.done; tries++) {
          posts = await fetchNextReels(supabase, me, cursor, (start) => {
            if (cursorRef.current === cursor) setStartPoster(start.video_poster_url ?? null);
          });
        }
        const batch = await loadReels(supabase, me, posts);
        if (cursorRef.current !== cursor) return;
        setReels((current) => [...current, ...batch.filter((r) => !current.some((c) => c.post.id === r.post.id))]);
        setDone(cursor.done);
        setMoreFailed(false);
        setPhase("ready");
      } catch (err) {
        console.error(err);
        if (cursorRef.current !== cursor) return;
        setPhase((current) => (current === "ready" ? current : "error"));
        setMoreFailed(true);
      } finally {
        if (cursorRef.current === cursor) loadingRef.current = false;
      }
    },
    [me]
  );

  // Premier lot : à l'ouverture, au changement d'onglet, après « Réessayer » ou « Revoir depuis le début »
  useEffect(() => {
    if (!me) return;
    const cursor = newCursor(tab, startId, sportFilter);
    cursorRef.current = cursor;
    loadingRef.current = false;
    // Lancé hors du corps de l'effet : les états ne changent qu'à l'arrivée des données
    void Promise.resolve().then(() => loadMore(cursor));
  }, [me, tab, startId, sportFilter, attempt, loadMore]);

  // Suite du fil quand on approche de la fin
  useEffect(() => {
    const cursor = cursorRef.current;
    if (phase === "ready" && cursor && !cursor.done && active >= reels.length - LOAD_AHEAD) void Promise.resolve().then(() => loadMore(cursor));
  }, [active, reels.length, phase, loadMore]);

  // Vidéo courante : celle qui est visible à plus de 70 %
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            activeRef.current = index;
            setActive(index);
          }
        }
      },
      { root: scroller, threshold: [VISIBLE_RATIO] }
    );
    scroller.querySelectorAll<HTMLElement>("[data-index]").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [reels.length, done, phase]);

  const goTo = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slides = scroller.querySelectorAll<HTMLElement>("[data-index]");
    const target = Math.max(0, Math.min(index, slides.length - 1));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: target * scroller.clientHeight, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Flèches du clavier (sauf dans un champ ou quand une fenêtre est ouverte)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      goTo(activeRef.current + (e.key === "ArrowDown" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // Molette / pavé tactile : une vidéo par mouvement (sauf dans une légende déployée qui défile)
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      const inner = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-scrollable]");
      if (inner && inner.scrollHeight > inner.clientHeight) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 8 || Date.now() < wheelLock.current) return;
      wheelLock.current = Date.now() + WHEEL_LOCK_MS;
      goTo(activeRef.current + (e.deltaY > 0 ? 1 : -1));
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [goTo]);

  function reset(nextTab: FeedTab) {
    cursorRef.current = null;
    loadingRef.current = false;
    setReels([]);
    setDone(false);
    setMoreFailed(false);
    setPhase("loading");
    setActive(0);
    activeRef.current = 0;
    setCommentsFor(null);
    scrollerRef.current?.scrollTo({ top: 0 });
    setTab(nextTab);
    setAttempt((n) => n + 1);
  }

  const onStatsChange = useCallback((postId: string, stats: PostStats) => {
    setReels((current) => current.map((r) => (r.post.id === postId ? { ...r, stats } : r)));
  }, []);
  const onFollowChange = useCallback((authorId: string, status: FollowStatus) => {
    setReels((current) => current.map((r) => (r.post.author_id === authorId ? { ...r, follow: status } : r)));
  }, []);
  const onDeleted = useCallback((post: PostRow) => {
    // La vidéo suivante prend sa place à l'écran
    setReels((current) => current.filter((r) => r.post.id !== post.id));
  }, []);
  const onBlocked = useCallback((authorId: string) => {
    setReels((current) => current.filter((r) => r.post.author_id !== authorId));
  }, []);
  const onSoundBlocked = useCallback(() => setSoundBlocked(true), []);

  function toggleSound() {
    if (soundOn) {
      writeSound(false);
    } else {
      setSoundBlocked(false);
      writeSound(true);
    }
  }

  const sports = useMemo(() => (catalog.status === "ready" ? new Map(catalog.sports.map((s) => [s.slug, s])) : new Map()), [catalog]);

  function back() {
    if (window.history.length > 1) router.back();
    else router.push("/accueil");
  }

  const empty = phase === "ready" && done && reels.length === 0;

  return (
    <main className="fixed inset-0 bg-black text-white">
      <h1 className="sr-only">{t("reels.title")}</h1>
      {/* Ordinateur : colonne de 480 px centrée, bandes noires de chaque côté ; téléphone : plein écran */}
      <div className="relative mx-auto h-dvh w-full max-w-[480px]">
        <div
          ref={scrollerRef}
          role="feed"
          aria-label={t("reels.feedLabel")}
          aria-busy={phase === "loading"}
          className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {phase === "loading" && (
            <section className="h-dvh snap-start snap-always">
              <ReelSkeleton poster={startPoster} />
            </section>
          )}

          {phase === "error" && (
            <section className="flex h-dvh snap-start flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="font-bold">{t("reels.loadError")}</p>
              <button
                type="button"
                onClick={() => reset(tab)}
                className="min-h-12 rounded-full bg-[#39ff14] px-6 font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("eventForm.retry")}
              </button>
            </section>
          )}

          {empty && (
            <section className="flex h-dvh snap-start flex-col items-center justify-center gap-5 px-8 text-center">
              <p className="text-lg font-bold">
                {sportFilter
                  ? t("home.videosEmptySport").replace("{sport}", sports.get(sportFilter)?.name ?? sportFilter)
                  : tab === "following"
                    ? t("reels.emptyFollowing")
                    : t("reels.empty")}
              </p>
              {tab === "forYou" ? (
                <Link
                  href="/publier"
                  className="min-h-12 rounded-full bg-[#39ff14] px-6 py-3 font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t("create.post")}
                </Link>
              ) : (
                <Link
                  href="/personnes"
                  className="min-h-12 rounded-full border-2 border-[#39ff14] px-6 py-3 font-bold text-[#39ff14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t("reels.findPeople")}
                </Link>
              )}
            </section>
          )}

          {phase === "ready" &&
            reels.map((reel, index) => {
              const live = index >= active - 1 && index <= active + 2;
              const sport = reel.post.sport ? sports.get(reel.post.sport) : undefined;
              return (
                <section
                  key={reel.post.id}
                  data-index={index}
                  aria-label={t("reels.videoOf").replace("{name}", reel.author?.username ? `@${reel.author.username}` : t("event.member"))}
                  className="h-dvh snap-start snap-always"
                >
                  <ReelItem
                    reel={reel}
                    me={me}
                    active={index === active}
                    live={live}
                    preload={index === active || index === active + 1 ? "auto" : "none"}
                    soundOn={soundOn}
                    sport={sport ? { name: sport.name, emoji: sport.emoji } : null}
                    onSoundBlocked={onSoundBlocked}
                    onStatsChange={onStatsChange}
                    onFollowChange={onFollowChange}
                    onOpenComments={setCommentsFor}
                    onDeleted={onDeleted}
                    onBlocked={onBlocked}
                    onMessage={announce}
                  />
                </section>
              );
            })}

          {/* Suite en cours de chargement, ou fin du fil */}
          {phase === "ready" && !done && (
            <section data-index={reels.length} className="h-dvh snap-start snap-always">
              <ReelSkeleton>
                {moreFailed ? (
                  <div className="relative z-10 flex flex-col items-center gap-3 px-8 text-center">
                    <p className="font-bold">{t("reels.loadError")}</p>
                    <button
                      type="button"
                      onClick={() => cursorRef.current && void loadMore(cursorRef.current)}
                      className="min-h-11 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {t("eventForm.retry")}
                    </button>
                  </div>
                ) : (
                  <p role="status" className="sr-only">
                    {t("reels.loadingMore")}
                  </p>
                )}
              </ReelSkeleton>
            </section>
          )}
          {phase === "ready" && reels.length > 0 && done && (
            <section data-index={reels.length} className="flex h-dvh snap-start snap-always flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="text-2xl font-black text-[#39ff14]">{t("reels.end")}</p>
              <Link
                href="/accueil"
                className="min-h-12 w-full max-w-xs rounded-full bg-[#39ff14] px-6 py-3 font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("post.backHome")}
              </Link>
              <button
                type="button"
                onClick={() => goTo(0)}
                className="min-h-12 w-full max-w-xs rounded-full border-2 border-white/40 px-6 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("reels.restart")}
              </button>
            </section>
          )}
        </div>

        {/* Barre du haut : retour, onglets, son (seuls les boutons reçoivent les clics) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={back}
            aria-label={t("common.back")}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg {...iconProps} className="h-6 w-6" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div role="tablist" aria-label={t("reels.feedLabel")} className="pointer-events-auto flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur-sm">
            {(["forYou", "following"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => value !== tab && reset(value)}
                className={`min-h-9 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                  tab === value ? "bg-[#39ff14] text-black" : "text-white/80 hover:text-white"
                }`}
              >
                {value === "forYou" ? t("feed.forYou") : t("feed.following")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? t("video.mute") : t("video.unmute")}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg {...iconProps} className="h-6 w-6" strokeWidth={2.2}>
              <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
              {soundOn ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
            </svg>
          </button>
        </div>

        {/* Messages brefs */}
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center px-4">
          {toast && <p className="rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</p>}
        </div>
      </div>

      {commentsFor && (
        <CommentsSheet
          key={commentsFor.id}
          postId={commentsFor.id}
          postAuthorId={commentsFor.author_id}
          me={me}
          onClose={() => setCommentsFor(null)}
          onMessage={announce}
          onCountChange={(delta) => {
            const id = commentsFor.id;
            setReels((current) =>
              current.map((r) => (r.post.id === id ? { ...r, stats: { ...r.stats, comments: Math.max(0, r.stats.comments + delta) } } : r))
            );
          }}
        />
      )}
    </main>
  );
}
