"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConfirmDialog from "../../components/ConfirmDialog";
import EventCard, { EventCardSkeleton } from "../../components/EventCard";
import FollowButton from "../../components/FollowButton";
import PersonRow from "../../components/PersonRow";
import PostCard from "../../components/PostCard";
import { PostSkeleton } from "../../components/home/PostFeed";
import { useEventParticipation } from "../../components/useEventParticipation";
import { displayCityLabel } from "../../lib/cities";
import { fetchGoingCounts, fetchMyStatuses, participationOf, type EventRow } from "../../lib/events";
import { followUser, loadMyStatuses, personName, unfollowUser, type FollowStatus, type Person } from "../../lib/follows";
import { useT, type MessageKey } from "../../lib/i18n";
import { EMPTY_STATS, loadPostDetails, type PostRow, type PostStats } from "../../lib/posts";
import {
  POSTS_PAGE,
  SEARCH_MIN,
  discoverPeople,
  fetchCities,
  fetchFollowersAmong,
  readRecentSearches,
  searchEvents,
  searchPeople,
  searchPosts,
  withRecent,
  writeRecentSearches,
} from "../../lib/search";
import { createClient } from "../../lib/supabase/client";
import { fetchCatalog, loadMySports, type CatalogSport } from "../../lib/userSports";

const SEARCH_DELAY = 300;
const ALL_PREVIEW = 3;

// Onglets dans un tableau : ajouter « Vidéos » plus tard = une ligne de plus ici (et son contenu)
const TABS = [
  { id: "all", label: "search.tabAll" },
  { id: "people", label: "search.tabPeople" },
  { id: "posts", label: "search.tabPosts" },
  { id: "events", label: "search.tabEvents" },
] as const satisfies readonly { id: string; label: MessageKey }[];
type Tab = (typeof TABS)[number]["id"];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

type Status = "loading" | "ready" | "error";
type Confirm = { kind: "cancelRequest" | "unfollow"; person: Person } | null;

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// useSearchParams() a besoin d'un <Suspense> (seulement autour de cette page)
export default function RecherchePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Recherche />
    </Suspense>
  );
}

function Recherche() {
  const router = useRouter();
  const t = useT();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = params.get("tab");
    return isTab(fromUrl) ? fromUrl : "all";
  });
  const [me, setMe] = useState("");
  const blocked = useRef<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);

  // Sans texte : recherches récentes et personnes à découvrir
  const [recent, setRecent] = useState<string[]>([]);
  const [discoverStatus, setDiscoverStatus] = useState<Status>("loading");
  const [discover, setDiscover] = useState<Person[]>([]);

  // Résultats de la dernière recherche
  const requestId = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [searched, setSearched] = useState(""); // texte des résultats affichés
  const [peopleStatus, setPeopleStatus] = useState<Status>("loading");
  const [people, setPeople] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Set<string>>(new Set());
  const [cities, setCities] = useState<Map<string, string>>(new Map());
  const [followStatuses, setFollowStatuses] = useState<Map<string, FollowStatus>>(new Map());
  const [postsStatus, setPostsStatus] = useState<Status>("loading");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postPeople, setPostPeople] = useState<Map<string, Person>>(new Map());
  const [postStats, setPostStats] = useState<Map<string, PostStats>>(new Map());
  const [postEvents, setPostEvents] = useState<Map<string, EventRow>>(new Map());
  const [postsMore, setPostsMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [eventsStatus, setEventsStatus] = useState<Status>("loading");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [age, setAge] = useState<number | null>(null);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string) => {
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const participation = useEventParticipation({ userId: me, onMessage: showToast });
  const { setStatuses: setEventStatuses, setCounts: setEventCounts } = participation;

  // Texte cherché : sans espaces autour ni « @ » au début (comme la page Communauté)
  const text = query.trim().replace(/^@/, "");
  const active = text.length >= SEARCH_MIN;

  // Focus automatique à l'ouverture
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Connexion, blocages, sports, recherches récentes (lues après le montage) et personnes à découvrir
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setMe(uid);
      setRecent(readRecentSearches(uid));
      setLoadedAt(Date.now());

      const [blocksResult, followsResult, mySports, ageResult, sports] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", uid),
        supabase.from("follows").select("followed_id").eq("follower_id", uid),
        loadMySports(supabase, uid).catch(() => []),
        supabase.rpc("get_age", { uid }),
        fetchCatalog(supabase).catch(() => [] as CatalogSport[]),
      ]);
      if (blocksResult.error) console.error(`Lecture des blocages impossible : ${blocksResult.error.message}`);
      blocked.current = new Set((blocksResult.data ?? []).map((row) => String(row.blocked_id)));
      setCatalog(sports);
      if (!ageResult.error && typeof ageResult.data === "number") setAge(ageResult.data);

      try {
        const following = new Set((followsResult.data ?? []).map((row) => String(row.followed_id)));
        const found = await discoverPeople(supabase, uid, blocked.current, following, mySports.map((s) => s.sportId));
        setDiscover(found);
        setDiscoverStatus("ready");
      } catch (err) {
        console.error("Personnes à découvrir indisponibles :", err);
        setDiscoverStatus("error");
      }
    });
  }, [router]);

  // Recherche : 300 ms après la frappe, 2 caractères minimum. Les réponses d'une recherche dépassée sont ignorées.
  useEffect(() => {
    if (!me) return;
    if (!active) {
      requestId.current += 1;
      const timer = setTimeout(() => router.replace(urlFor("", tab), { scroll: false }), SEARCH_DELAY);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const id = ++requestId.current;
      const fresh = () => id === requestId.current;
      router.replace(urlFor(text, tab), { scroll: false });
      setSearched(text);
      setPeopleStatus("loading");
      setPostsStatus("loading");
      setEventsStatus("loading");
      const supabase = createClient();

      // Personnes : celles que je suis ou qui me suivent d'abord, avec leur ville si elle est affichée
      void (async () => {
        try {
          const list = await searchPeople(supabase, me, text, blocked.current);
          const ids = list.map((p) => p.id);
          const [mine, theirs, cityMap] = await Promise.all([
            loadMyStatuses(supabase, me, ids),
            fetchFollowersAmong(supabase, me, ids),
            fetchCities(supabase, ids),
          ]);
          if (!fresh()) return;
          const close = (p: Person) => (mine.get(p.id) === "accepted" || theirs.has(p.id) ? 0 : 1);
          setPeople(list.map((p, i) => ({ p, i })).sort((a, b) => close(a.p) - close(b.p) || a.i - b.i).map(({ p }) => p));
          setFollowStatuses(new Map(ids.map((pid) => [pid, mine.get(pid) ?? null])));
          setFollowers(theirs);
          setCities(cityMap);
          setPeopleStatus("ready");
        } catch (err) {
          console.error("Recherche de personnes impossible :", err);
          if (fresh()) setPeopleStatus("error");
        }
      })();

      // Publications : auteurs, compteurs et événements liés en une requête chacun
      void (async () => {
        try {
          const page = await searchPosts(supabase, text, null);
          const details = await loadPostDetails(supabase, page);
          if (!fresh()) return;
          setPosts(page);
          setPostPeople(details.people);
          setPostStats(details.stats);
          setPostEvents(details.events);
          setPostsMore(page.length === POSTS_PAGE);
          setPostsStatus("ready");
        } catch (err) {
          console.error(err);
          if (fresh()) setPostsStatus("error");
        }
      })();

      // Événements : nombre d'inscrits et mon statut, comme sur l'accueil
      void (async () => {
        try {
          const found = await searchEvents(supabase, text);
          const [counts, statuses] = await Promise.all([fetchGoingCounts(supabase, found.map((e) => e.id)), fetchMyStatuses(supabase, me)]);
          if (!fresh()) return;
          setEvents(found);
          setEventCounts(counts);
          setEventStatuses(statuses);
          setEventsStatus("ready");
        } catch (err) {
          console.error(err);
          if (fresh()) setEventsStatus("error");
        }
      })();
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
    // tab : l'adresse est mise à jour au changement d'onglet (selectTab), pas besoin de relancer la recherche
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active, me, attempt, router, setEventCounts, setEventStatuses]);

  function urlFor(q: string, currentTab: Tab): string {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (currentTab !== "all") search.set("tab", currentTab);
    const qs = search.toString();
    return qs ? `/recherche?${qs}` : "/recherche";
  }

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(urlFor(active ? text : "", next), { scroll: false });
  }

  function saveRecent(value: string) {
    if (!me) return;
    const next = withRecent(recent, value);
    setRecent(next);
    writeRecentSearches(me, next);
  }

  function removeRecent(value: string) {
    const next = recent.filter((item) => item !== value);
    setRecent(next);
    writeRecentSearches(me, next);
  }

  function clearRecent() {
    setRecent([]);
    writeRecentSearches(me, []);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (active) saveRecent(text);
    inputRef.current?.blur();
  }

  async function morePosts() {
    const last = posts[posts.length - 1];
    if (!last || postsLoadingMore) return;
    const id = requestId.current;
    setPostsLoadingMore(true);
    try {
      const supabase = createClient();
      const page = await searchPosts(supabase, searched, last.created_at);
      const details = await loadPostDetails(supabase, page);
      if (id !== requestId.current) return;
      setPosts((current) => [...current, ...page.filter((p) => !current.some((c) => c.id === p.id))]);
      setPostPeople((current) => new Map([...current, ...details.people]));
      setPostStats((current) => new Map([...current, ...details.stats]));
      setPostEvents((current) => new Map([...current, ...details.events]));
      setPostsMore(page.length === POSTS_PAGE);
    } catch (err) {
      console.error(err);
      showToast(t("search.failed"));
    } finally {
      setPostsLoadingMore(false);
    }
  }

  // ---------- Suivre / annuler / se désabonner (même logique que la page Communauté) ----------

  function nameOf(person: Person) {
    return personName(person, person.username ? `@${person.username}` : t("privacy.unknownUser"));
  }

  async function follow(person: Person) {
    setBusyKey(`follow:${person.id}`);
    try {
      const status = await followUser(createClient(), me, person.id);
      setFollowStatuses((current) => new Map(current).set(person.id, status));
      showToast(t(status === "pending" ? "people.requestSent" : "people.nowFollowing").replace("{name}", nameOf(person)));
    } catch (err) {
      console.error("Abonnement impossible :", err);
      showToast(t("publicProfile.followError"));
    }
    setBusyKey(null);
  }

  async function confirmRemove() {
    if (!confirm) return;
    const { kind, person } = confirm;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await unfollowUser(createClient(), me, person.id);
    } catch (err) {
      console.error("Désabonnement impossible :", err);
      setConfirmBusy(false);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    setFollowStatuses((current) => new Map(current).set(person.id, null));
    setConfirmBusy(false);
    setConfirm(null);
    showToast(t(kind === "unfollow" ? "people.unfollowed" : "people.requestCancelled").replace("{name}", nameOf(person)));
  }

  // ---------- Morceaux ----------

  const sportsBySlug = useMemo(() => new Map(catalog.map((s) => [s.slug, s])), [catalog]);

  function personRow(person: Person) {
    const status = followStatuses.get(person.id) ?? null;
    const tag = status === "accepted" ? t("search.youFollow") : followers.has(person.id) ? t("search.followsYou") : "";
    const city = cities.get(person.id);
    const subtitle = [tag, city ? displayCityLabel(city) : ""].filter(Boolean).join(" · ");
    return (
      <PersonRow
        key={person.id}
        person={person}
        subtitle={subtitle || undefined}
        actions={
          <FollowButton
            size="small"
            status={status}
            busy={busyKey === `follow:${person.id}`}
            name={nameOf(person)}
            privateAccount={person.isPrivate && status === null}
            followBack={followers.has(person.id)}
            onFollow={() => void follow(person)}
            onPending={() => {
              setConfirmError("");
              setConfirm({ kind: "cancelRequest", person });
            }}
            onAccepted={() => {
              setConfirmError("");
              setConfirm({ kind: "unfollow", person });
            }}
          />
        }
      />
    );
  }

  function postCard(post: PostRow) {
    return (
      <PostCard
        key={post.id}
        post={post}
        author={postPeople.get(post.author_id)}
        stats={postStats.get(post.id) ?? EMPTY_STATS}
        event={post.event_id ? postEvents.get(post.event_id) : undefined}
        me={me}
        now={loadedAt}
        onMessage={showToast}
        onDeleted={(deleted) => setPosts((current) => current.filter((p) => p.id !== deleted.id))}
        onBlocked={(authorId) => {
          blocked.current.add(authorId);
          setPosts((current) => current.filter((p) => p.author_id !== authorId));
          setPeople((current) => current.filter((p) => p.id !== authorId));
        }}
      />
    );
  }

  function eventCard(event: EventRow) {
    return (
      <EventCard
        key={event.id}
        event={event}
        sport={sportsBySlug.get(event.sport)}
        goingCount={participation.counts.get(event.id) ?? 0}
        participation={participationOf(event, me, participation.statuses.get(event.id))}
        tooYoung={age !== null && age < event.min_age}
        busy={participation.busyId === event.id}
        onJoin={() => void participation.join(event)}
        onLeave={() => participation.askLeave(event)}
      />
    );
  }

  const retry = () => setAttempt((n) => n + 1);
  const allReady = peopleStatus !== "loading" && postsStatus !== "loading" && eventsStatus !== "loading";
  const allFailed = peopleStatus === "error" && postsStatus === "error" && eventsStatus === "error";
  const nothing = allReady && people.length === 0 && posts.length === 0 && events.length === 0;
  const stale = searched !== text; // les résultats affichés concernent un texte précédent (nouvelle recherche en route)

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-4 pb-12 pt-4">
        {/* En-tête : retour et champ de recherche */}
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/accueil"))}
            aria-label={t("common.back")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <form role="search" onSubmit={submit} className="relative min-w-0 flex-1">
            <label htmlFor="recherche" className="sr-only">
              {t("search.label")}
            </label>
            <svg {...iconProps} className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={2.2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={inputRef}
              id="recherche"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-11 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label={t("search.clear")}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
              >
                <svg {...iconProps} className="h-4 w-4" strokeWidth={2.6}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </form>
        </header>

        {!active ? (
          // ---------- Sans texte : récentes et personnes à découvrir ----------
          <>
            {recent.length > 0 && (
              <section aria-labelledby="titre-recentes" className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 id="titre-recentes" className="text-sm font-bold uppercase tracking-wide text-muted">
                    {t("search.recent")}
                  </h2>
                  <button type="button" onClick={clearRecent} className="min-h-11 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink">
                    {t("search.clearAll")}
                  </button>
                </div>
                <ul className="flex flex-col">
                  {recent.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuery(item)}
                        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-accent-ink"
                      >
                        <svg {...iconProps} className="h-5 w-5 shrink-0 text-muted" strokeWidth={2}>
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        <span className="truncate">{item}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecent(item)}
                        aria-label={t("search.removeRecent").replace("{q}", item)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
                      >
                        <svg {...iconProps} className="h-4 w-4" strokeWidth={2.6}>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="titre-decouvrir" className="mt-6">
              <h2 id="titre-decouvrir" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                {t("search.discover")}
              </h2>
              {discoverStatus === "loading" && <PeopleSkeleton count={4} />}
              {discoverStatus === "error" && <p className="text-sm text-muted">{t("search.discoverError")}</p>}
              {discoverStatus === "ready" && discover.length === 0 && <p className="text-sm text-muted">{t("search.discoverEmpty")}</p>}
              {discoverStatus === "ready" && discover.length > 0 && <ul className="flex flex-col gap-2">{discover.map(personRow)}</ul>}
            </section>
          </>
        ) : (
          // ---------- Avec texte : onglets et résultats ----------
          <>
            <div role="tablist" aria-label={t("search.tabsLabel")} className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`onglet-${item.id}`}
                    aria-selected={tab === item.id}
                    aria-controls="resultats"
                    onClick={() => selectTab(item.id)}
                    className={`min-h-10 whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                      tab === item.id ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-accent-ink"
                    }`}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* Ouvrir un résultat l'ajoute aux recherches récentes */}
            <div
              id="resultats"
              role="tabpanel"
              aria-labelledby={`onglet-${tab}`}
              aria-busy={stale || !allReady}
              className="mt-4 flex flex-col gap-6"
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("a")) saveRecent(searched || text);
              }}
            >
              {stale ? (
                <ResultsSkeleton tab={tab} />
              ) : allFailed ? (
                <Failed onRetry={retry} />
              ) : tab === "all" && nothing ? (
                <NoResults text={searched} />
              ) : tab === "all" ? (
                <>
                  <Section title={t("search.tabPeople")} status={peopleStatus} count={people.length} onSeeAll={() => selectTab("people")} onRetry={retry} skeleton={<PeopleSkeleton count={3} />}>
                    <ul className="flex flex-col gap-2">{people.slice(0, ALL_PREVIEW).map(personRow)}</ul>
                  </Section>
                  <Section title={t("search.tabPosts")} status={postsStatus} count={posts.length} onSeeAll={() => selectTab("posts")} onRetry={retry} skeleton={<PostSkeleton />}>
                    <div className="flex flex-col gap-4">{posts.slice(0, ALL_PREVIEW).map(postCard)}</div>
                  </Section>
                  <Section title={t("search.tabEvents")} status={eventsStatus} count={events.length} onSeeAll={() => selectTab("events")} onRetry={retry} skeleton={<EventCardSkeleton />}>
                    <div className="flex flex-col gap-3">{events.slice(0, ALL_PREVIEW).map(eventCard)}</div>
                  </Section>
                </>
              ) : tab === "people" ? (
                <TabContent status={peopleStatus} empty={people.length === 0} text={searched} onRetry={retry} skeleton={<PeopleSkeleton count={5} />}>
                  <ul className="flex flex-col gap-2">{people.map(personRow)}</ul>
                </TabContent>
              ) : tab === "posts" ? (
                <TabContent status={postsStatus} empty={posts.length === 0} text={searched} onRetry={retry} skeleton={<PostSkeleton />}>
                  <div className="flex flex-col gap-4">
                    {posts.map(postCard)}
                    {postsMore && (
                      <button
                        type="button"
                        onClick={() => void morePosts()}
                        disabled={postsLoadingMore}
                        aria-busy={postsLoadingMore}
                        className="min-h-12 w-full rounded-2xl border border-accent-ink text-sm font-bold text-accent-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                      >
                        {postsLoadingMore ? t("common.loading") : t("feed.more")}
                      </button>
                    )}
                  </div>
                </TabContent>
              ) : (
                <TabContent status={eventsStatus} empty={events.length === 0} text={searched} onRetry={retry} skeleton={<EventCardSkeleton />}>
                  <div className="flex flex-col gap-3">{events.map(eventCard)}</div>
                </TabContent>
              )}
            </div>
          </>
        )}
      </div>

      {participation.leaveDialog}
      {participation.birthDateNotice}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "unfollow"
            ? t("publicProfile.unfollowConfirmTitle").replace("{handle}", confirm ? `@${confirm.person.username ?? ""}` : "")
            : t("people.cancelRequestTitle").replace("{handle}", confirm ? `@${confirm.person.username ?? ""}` : "")
        }
        confirmLabel={confirm?.kind === "unfollow" ? t("publicProfile.unfollow") : t("publicProfile.cancelRequest")}
        danger={confirm?.kind === "unfollow"}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={() => void confirmRemove()}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>}
      </div>
    </main>
  );
}

// ---------- Morceaux d'affichage ----------

function Section({
  title,
  status,
  count,
  onSeeAll,
  onRetry,
  skeleton,
  children,
}: {
  title: string;
  status: Status;
  count: number;
  onSeeAll: () => void;
  onRetry: () => void;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  // Section sans résultat : masquée
  if (status === "ready" && count === 0) return null;
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        {status === "ready" && count > ALL_PREVIEW && (
          <button type="button" onClick={onSeeAll} className="min-h-11 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink">
            {t("home.seeAll")}
          </button>
        )}
      </div>
      {status === "loading" ? skeleton : status === "error" ? <Failed onRetry={onRetry} compact /> : children}
    </section>
  );
}

function TabContent({
  status,
  empty,
  text,
  onRetry,
  skeleton,
  children,
}: {
  status: Status;
  empty: boolean;
  text: string;
  onRetry: () => void;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  if (status === "loading") return <>{skeleton}</>;
  if (status === "error") return <Failed onRetry={onRetry} />;
  if (empty) return <NoResults text={text} />;
  return <>{children}</>;
}

function NoResults({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="mt-6 flex flex-col items-center gap-2 text-center">
      <svg {...iconProps} className="h-10 w-10 text-accent-ink" strokeWidth={1.8}>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <p className="font-bold">{t("search.noResults").replace("{q}", text)}</p>
      <p className="text-sm text-muted">{t("search.noResultsHint")}</p>
    </div>
  );
}

function Failed({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 ${compact ? "py-2" : "py-4"} text-sm`}>
      <span className="text-muted">{t("search.failed")}</span>
      <button type="button" onClick={onRetry} className="min-h-11 font-bold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-accent-ink">
        {t("eventForm.retry")}
      </button>
    </div>
  );
}

function PeopleSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, n) => (
        <li key={n} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-line" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-line" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-line" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded-xl bg-line" />
        </li>
      ))}
    </ul>
  );
}

function ResultsSkeleton({ tab }: { tab: Tab }) {
  if (tab === "posts") return <PostSkeleton />;
  if (tab === "events") return <EventCardSkeleton />;
  return <PeopleSkeleton count={tab === "people" ? 5 : 3} />;
}

function PageSkeleton() {
  const t = useT();
  return (
    <main className="bg-background text-foreground">
      <div role="status" aria-label={t("common.loading")} className="mx-auto w-full max-w-[500px] px-4 pt-4">
        <div className="h-12 w-full animate-pulse rounded-full bg-surface" />
        <div className="mt-6">
          <PeopleSkeleton count={4} />
        </div>
      </div>
    </main>
  );
}
