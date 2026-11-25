"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import FramedBackground from "../FramedBackground";
import TextOverlayLayer from "../TextOverlayLayer";
import { FRAME_RATIO, VERTICAL_FRAME_RATIO, framedMediaStyle, type Framing } from "../../lib/framing";
import { useLanguage, useT } from "../../lib/i18n";
import { fromOverlays } from "../../lib/overlayData";
import { POST_COLUMNS, loadPostStats, postMedia, type MediaItem, type PostRow } from "../../lib/posts";
import { createClient } from "../../lib/supabase/client";

const PAGE = 18;

type Kind = "post" | "video";

// Onglet « Publications » du profil : sous-onglets « Posts » (grille 4:5) et « Vidéos » (grille 9:16 avec les vues).
// Chargement par pages de 18 au défilement. Les règles d'accès de la base filtrent déjà ce que chacun peut voir
// (compte privé : seulement ses abonnés acceptés).
export default function ProfilePublications({ authorId, username, mine }: { authorId: string; username: string | null; mine: boolean }) {
  const t = useT();
  const baseId = useId();
  const [kind, setKind] = useState<Kind>("post");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const kinds: Kind[] = ["post", "video"];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = kind === "post" ? "video" : "post";
    setKind(next);
    refs.current[kinds.indexOf(next)]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={t("profile.subtabs")} onKeyDown={onKeyDown} className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
        {kinds.map((value, index) => {
          const selected = value === kind;
          return (
            <button
              key={value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-${value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setKind(value)}
              className={`flex min-h-10 items-center justify-center gap-2 rounded-full text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                selected ? "bg-accent text-on-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {value === "post" ? <GridIcon /> : <ReelIcon />}
              {value === "post" ? t("profile.posts") : t("profile.videos")}
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${kind}`} className="mt-3">
        <PublicationGrid key={kind} kind={kind} authorId={authorId} username={username} mine={mine} />
      </div>
    </div>
  );
}

type Load = { status: "loading" | "error" | "ready"; posts: PostRow[]; views: Map<string, number>; hasMore: boolean };

function PublicationGrid({ kind, authorId, username, mine }: { kind: Kind; authorId: string; username: string | null; mine: boolean }) {
  const t = useT();
  const language = useLanguage();
  const [load, setLoad] = useState<Load>({ status: "loading", posts: [], views: new Map(), hasMore: false });
  const [attempt, setAttempt] = useState(0);
  const loadingMore = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const supabase = createClient();
      let request = supabase.from("posts").select(POST_COLUMNS).eq("author_id", authorId).eq("kind", kind).order("created_at", { ascending: false }).limit(PAGE);
      if (before) request = request.lt("created_at", before);
      const { data, error } = await request;
      if (error) throw new Error(`Lecture des publications du profil impossible : ${error.message} (code ${error.code})`);
      const posts = (data ?? []) as PostRow[];
      // Vidéos : nombre de vues (une seule requête post_stats pour la page)
      const views = new Map<string, number>();
      if (kind === "video" && posts.length > 0) {
        const stats = await loadPostStats(supabase, posts.map((p) => p.id)).catch(() => new Map());
        for (const [id, s] of stats) views.set(id, s.views);
      }
      return { posts, views };
    },
    [authorId, kind]
  );

  // Première page
  useEffect(() => {
    let cancelled = false;
    fetchPage(null).then(
      ({ posts, views }) => !cancelled && setLoad({ status: "ready", posts, views, hasMore: posts.length === PAGE }),
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setLoad({ status: "error", posts: [], views: new Map(), hasMore: false });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, attempt]);

  // Pages suivantes quand le bas de la grille approche (défilement infini)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || load.status !== "ready" || !load.hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loadingMore.current) return;
        const last = load.posts[load.posts.length - 1];
        if (!last) return;
        loadingMore.current = true;
        fetchPage(last.created_at).then(
          ({ posts, views }) => {
            loadingMore.current = false;
            setLoad((current) => ({
              status: "ready",
              posts: [...current.posts, ...posts.filter((p) => !current.posts.some((c) => c.id === p.id))],
              views: new Map([...current.views, ...views]),
              hasMore: posts.length === PAGE,
            }));
          },
          (err: unknown) => {
            loadingMore.current = false;
            console.error(err);
            setLoad((current) => ({ ...current, hasMore: false }));
          }
        );
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load, fetchPage]);

  const ratio = kind === "post" ? FRAME_RATIO : VERTICAL_FRAME_RATIO;

  if (load.status === "loading") {
    return (
      <ul role="status" aria-label={t("common.loading")} className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 9 }, (_, i) => (
          <li key={i} aria-hidden="true" className="animate-pulse bg-surface" style={{ aspectRatio: ratio }} />
        ))}
      </ul>
    );
  }

  if (load.status === "error") {
    return (
      <p className="mx-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-danger">
        {t("profile.loadError")}
        <button
          type="button"
          onClick={() => {
            setLoad({ status: "loading", posts: [], views: new Map(), hasMore: false });
            setAttempt((n) => n + 1);
          }}
          className="min-h-11 font-bold text-accent-ink underline"
        >
          {t("eventForm.retry")}
        </button>
      </p>
    );
  }

  if (load.posts.length === 0) {
    return (
      <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
        <p className="text-sm font-bold">{kind === "post" ? t("profile.noPosts") : t("profile.noVideos")}</p>
        {mine && (
          <Link
            href={kind === "post" ? "/publier" : "/publier?type=video"}
            className="rounded-full bg-accent px-5 py-3 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {kind === "post" ? t("profile.createPost") : t("profile.createVideo")}
          </Link>
        )}
      </div>
    );
  }

  const format = new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", { notation: "compact" });
  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5">
        {load.posts.map((post) => {
          const media = postMedia(post);
          const first = media[0];
          const href =
            kind === "video"
              ? username
                ? `/videos?author=${encodeURIComponent(username)}&start=${encodeURIComponent(post.id)}`
                : `/videos?start=${encodeURIComponent(post.id)}`
              : `/publication/${encodeURIComponent(post.id)}`;
          const views = load.views.get(post.id) ?? 0;
          return (
            <li key={post.id}>
              <Link
                href={href}
                aria-label={post.body?.trim() ? post.body.trim().slice(0, 120) : kind === "video" ? t("profile.videos") : t("profile.posts")}
                className="relative block overflow-hidden bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
                style={{ aspectRatio: ratio }}
              >
                <Thumb item={first} frame={ratio} body={post.body} />
                {kind === "post" && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex gap-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {media.some((m) => m.type === "video") && <VideoIcon />}
                    {media.length > 1 && <StackIcon />}
                  </span>
                )}
                {kind === "video" && (
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
                    </svg>
                    <span className="sr-only">{t("profile.viewsCount").replace("{n}", String(views))}</span>
                    <span aria-hidden="true" className="tabular-nums">
                      {format.format(views)}
                    </span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {load.hasMore && (
        <div ref={sentinelRef} className="grid grid-cols-3 gap-0.5 pt-0.5" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="animate-pulse bg-surface" style={{ aspectRatio: ratio }} />
          ))}
        </div>
      )}
    </>
  );
}

// Vignette : 1re photo, ou affiche de la 1re vidéo (avec son cadrage et ses textes), ou début du texte
function Thumb({ item, frame, body }: { item: MediaItem | undefined; frame: number; body: string | null }) {
  if (!item) {
    return <span className="absolute inset-0 line-clamp-6 p-2 text-[11px] leading-snug text-muted">{body?.trim() ?? ""}</span>;
  }
  if (item.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- vignette légère (photo déjà au format 4:5 si recadrée)
    return <img src={item.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />;
  }
  const framing: Framing | null = item.framing ? { ...item.framing, frame: item.framing.frame ?? frame } : null;
  return (
    <>
      {framing && <FramedBackground framing={framing} poster={item.poster ?? null} />}
      {item.poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- affiche recadrée comme la vidéo
        <img
          src={item.poster}
          alt=""
          loading="lazy"
          style={
            framing?.aspect
              ? framedMediaStyle(framing, framing.aspect)
              : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
          }
        />
      ) : (
        <span className="absolute inset-0 bg-black" />
      )}
      {item.overlays && <TextOverlayLayer blocks={fromOverlays(item.overlays)} />}
    </>
  );
}

const icon = { "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function GridIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ReelIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M10.5 9.5v5l4-2.5z" fill="currentColor" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <rect x="7" y="7" width="13" height="13" rx="2" fill="rgba(0,0,0,0.25)" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}
