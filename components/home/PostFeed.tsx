"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PostCard from "../PostCard";
import type { EventRow } from "../../lib/events";
import type { Person } from "../../lib/follows";
import { useT } from "../../lib/i18n";
import {
  EMPTY_STATS,
  FEED_PAGE_SIZE,
  fetchFeedPage,
  fetchFollowingIds,
  loadPostDetails,
  type PostRow,
  type PostStats,
} from "../../lib/posts";
import { createClient } from "../../lib/supabase/client";

type Tab = "forYou" | "following";
type Load = "loading" | "error" | "ready";

// Fil de publications de l'accueil : « Pour toi » (tout ce que je peux voir) et « Abonnements » (personnes suivies).
// sport : filtre choisi avec les cercles de sport en haut de l'accueil. refreshKey : change après une publication.
export default function PostFeed({
  me,
  sport,
  refreshKey = 0,
  onMessage,
}: {
  me: string;
  sport: string | null;
  refreshKey?: number;
  onMessage: (text: string) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("forYou");
  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [stats, setStats] = useState<Map<string, PostStats>>(new Map());
  const [events, setEvents] = useState<Map<string, EventRow>>(new Map());
  const [following, setFollowing] = useState<string[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  // Première page : à l'ouverture, au changement d'onglet ou de sport, après une publication
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const followed = tab === "following" ? await fetchFollowingIds(supabase, me) : null;
        const page = await fetchFeedPage(supabase, { following: followed, sport, before: null });
        const details = await loadPostDetails(supabase, page);
        if (cancelled) return;
        setFollowing(followed);
        setPosts(page);
        setPeople(details.people);
        setStats(details.stats);
        setEvents(details.events);
        setHasMore(page.length === FEED_PAGE_SIZE);
        setMoreFailed(false);
        setLoadedAt(Date.now());
        setLoad("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoad("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, tab, sport, refreshKey, attempt]);

  // Page suivante : curseur = date de la dernière publication affichée
  async function loadMore() {
    const last = posts[posts.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const supabase = createClient();
      const page = await fetchFeedPage(supabase, { following, sport, before: last.created_at });
      const details = await loadPostDetails(supabase, page);
      setPosts((current) => [...current, ...page.filter((p) => !current.some((c) => c.id === p.id))]);
      setPeople((current) => new Map([...current, ...details.people]));
      setStats((current) => new Map([...current, ...details.stats]));
      setEvents((current) => new Map([...current, ...details.events]));
      setHasMore(page.length === FEED_PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setMoreFailed(true);
    }
    setLoadingMore(false);
  }

  function changeTab(next: Tab) {
    if (next === tab) return;
    setLoad("loading");
    setTab(next);
  }

  return (
    <section aria-labelledby="fil-titre" className="mt-6">
      <h2 id="fil-titre" className="sr-only">
        {t("feed.title")}
      </h2>
      <div role="tablist" aria-label={t("feed.title")} className="mx-4 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
        {(["forYou", "following"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`fil-${value}`}
            aria-selected={tab === value}
            aria-controls="fil-liste"
            onClick={() => changeTab(value)}
            className={`min-h-10 rounded-full text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
              tab === value ? "bg-accent text-on-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {value === "forYou" ? t("feed.forYou") : t("feed.following")}
          </button>
        ))}
      </div>

      <div id="fil-liste" role="tabpanel" aria-labelledby={`fil-${tab}`} className="mt-4 flex flex-col gap-4 px-4">
        {load === "loading" && [0, 1].map((n) => <PostSkeleton key={n} />)}

        {load === "error" && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-danger">
            {t("feed.loadError")}
            <button
              type="button"
              onClick={() => {
                setLoad("loading");
                setAttempt((n) => n + 1);
              }}
              className="min-h-11 font-bold text-accent-ink underline"
            >
              {t("eventForm.retry")}
            </button>
          </p>
        )}

        {load === "ready" && posts.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-bold">{t("feed.empty")}</p>
            <Link
              href="/publier"
              className="rounded-full bg-accent px-5 py-3 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {t("create.post")}
            </Link>
          </div>
        )}

        {load === "ready" &&
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              author={people.get(post.author_id)}
              stats={stats.get(post.id) ?? EMPTY_STATS}
              event={post.event_id ? events.get(post.event_id) : undefined}
              me={me}
              now={loadedAt}
              onMessage={onMessage}
              onDeleted={(deleted) => setPosts((current) => current.filter((p) => p.id !== deleted.id))}
              onBlocked={(authorId) => setPosts((current) => current.filter((p) => p.author_id !== authorId))}
            />
          ))}

        {load === "ready" && hasMore && (
          <div className="flex flex-col items-center gap-2">
            {moreFailed && <p className="text-sm text-danger">{t("feed.loadError")}</p>}
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              className="min-h-12 w-full rounded-2xl border border-accent-ink text-sm font-bold text-accent-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {loadingMore ? t("common.loading") : t("feed.more")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function PostSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-full bg-line" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-1/5 animate-pulse rounded bg-line" />
        </div>
      </div>
      <div className="mt-3 h-3 w-5/6 animate-pulse rounded bg-line" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-line" />
      <div className="mt-3 aspect-[4/3] w-full animate-pulse rounded-xl bg-line" />
    </div>
  );
}
