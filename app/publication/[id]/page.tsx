"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Avatar from "../../../components/Avatar";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ExpandableText from "../../../components/ExpandableText";
import PostCard from "../../../components/PostCard";
import { PostSkeleton } from "../../../components/home/PostFeed";
import type { EventRow } from "../../../lib/events";
import { loadPeople, type Person } from "../../../lib/follows";
import { useLanguage, useT } from "../../../lib/i18n";
import {
  COMMENT_BODY_MAX,
  COMMENT_COLUMNS,
  EMPTY_STATS,
  POST_COLUMNS,
  loadPostDetails,
  postErrorKey,
  type CommentRow,
  type PostRow,
  type PostStats,
} from "../../../lib/posts";
import { initialsOf } from "../../../lib/profile";
import { createClient } from "../../../lib/supabase/client";
import { relativeTime } from "../../../lib/time";

const COMMENTS_LIMIT = 200;

// L'identifiant n'est connu qu'au moment de la visite : useParams() a besoin d'un <Suspense> (seulement ici)
export default function PublicationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Publication />
    </Suspense>
  );
}

type Load = "loading" | "notFound" | "error" | "ready";

function Publication() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();
  const params = useParams<{ id: string }>();
  const postId = decodeURIComponent(params.id ?? "");

  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [me, setMe] = useState("");
  const [post, setPost] = useState<PostRow | null>(null);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [stats, setStats] = useState<PostStats>(EMPTY_STATS);
  const [event, setEvent] = useState<EventRow | undefined>(undefined);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [toDelete, setToDelete] = useState<CommentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setMe(uid);

      const [postResult, commentsResult] = await Promise.all([
        supabase.from("posts").select(POST_COLUMNS).eq("id", postId).maybeSingle(),
        supabase.from("post_comments").select(COMMENT_COLUMNS).eq("post_id", postId).order("created_at", { ascending: true }).limit(COMMENTS_LIMIT),
      ]);
      // Identifiant mal formé (22P02) ou publication cachée par les règles d'accès : introuvable
      if (postResult.error && postResult.error.code !== "22P02") {
        console.error(`Lecture de la publication impossible : ${postResult.error.message} (code ${postResult.error.code})`);
        setLoad("error");
        return;
      }
      const row = postResult.data as PostRow | null;
      if (!row) {
        setLoad("notFound");
        return;
      }
      let list: CommentRow[] = [];
      if (commentsResult.error) {
        console.error(`Lecture des commentaires impossible : ${commentsResult.error.message} (code ${commentsResult.error.code})`);
        setCommentsFailed(true);
      } else {
        list = (commentsResult.data ?? []) as CommentRow[];
        setCommentsFailed(false);
      }

      const details = await loadPostDetails(supabase, [row]);
      // Auteurs des commentaires (l'auteur de la publication est déjà lu)
      const commenters = [...new Set(list.map((c) => c.author_id))].filter((id) => !details.people.has(id));
      const more = await loadPeople(supabase, commenters).catch(() => [] as Person[]);

      setPost(row);
      setStats(details.stats.get(row.id) ?? EMPTY_STATS);
      setEvent(row.event_id ? details.events.get(row.event_id) : undefined);
      setPeople(new Map([...details.people, ...more.map((p) => [p.id, p] as const)]));
      setComments(list);
      setLoadedAt(Date.now());
      setLoad("ready");
    });
  }, [router, postId, attempt]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || !post) return;
    setSending(true);
    setSendError("");
    const { data, error } = await createClient()
      .from("post_comments")
      .insert({ post_id: post.id, author_id: me, body: text })
      .select(COMMENT_COLUMNS)
      .single();
    setSending(false);
    if (error || !data) {
      if (error) console.error(`Commentaire impossible : ${error.message} (code ${error.code})`);
      const key = error ? postErrorKey(error) : "comment.errorGeneric";
      setSendError(t(key === "post.errorGeneric" ? "comment.errorGeneric" : key));
      return;
    }
    setComments((current) => [...current, data as CommentRow]);
    setStats((current) => ({ ...current, comments: current.comments + 1 }));
    setDraft("");
    // Mon profil pour afficher mon commentaire, s'il n'est pas déjà lu
    if (!people.has(me)) {
      const [mine] = await loadPeople(createClient(), [me]).catch(() => [] as Person[]);
      if (mine) setPeople((current) => new Map(current).set(me, mine));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const { data, error } = await createClient().from("post_comments").delete().eq("id", toDelete.id).select("id");
    setDeleting(false);
    if (error || !data || data.length === 0) {
      console.error(error ? `Suppression du commentaire impossible : ${error.message} (code ${error.code})` : "Suppression du commentaire refusée");
      setDeleteError(t("comment.deleteError"));
      return;
    }
    const id = toDelete.id;
    setComments((current) => current.filter((c) => c.id !== id));
    setStats((current) => ({ ...current, comments: Math.max(0, current.comments - 1) }));
    setToDelete(null);
    showToast(t("comment.deleted"));
  }

  if (load === "loading") return <PageSkeleton />;

  if (load !== "ready" || !post) {
    return (
      <main className="bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-bold">{load === "error" ? t("feed.loadError") : t("post.notFound")}</h1>
          <div className="mt-2 flex flex-col gap-3">
            {load === "error" && (
              <button
                type="button"
                onClick={() => {
                  setLoad("loading");
                  setAttempt((n) => n + 1);
                }}
                className="rounded-2xl bg-accent px-6 py-3 font-bold text-on-accent"
              >
                {t("eventForm.retry")}
              </button>
            )}
            <Link href="/accueil" className="rounded-2xl border border-accent-ink px-6 py-3 font-bold text-accent-ink">
              {t("post.backHome")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const unknown = t("event.member");

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        <header className="mb-4 grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/accueil"))}
            aria-label={t("common.back")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-center text-lg font-bold">{t("post.title")}</h1>
        </header>

        <PostCard
          post={post}
          author={people.get(post.author_id)}
          stats={stats}
          event={event}
          me={me}
          now={loadedAt}
          onMessage={showToast}
          onDeleted={() => router.push("/accueil")}
          onBlocked={() => router.push("/accueil")}
          commentsLink={false}
          fullText
        />

        <section aria-labelledby="titre-commentaires" className="mt-6">
          <h2 id="titre-commentaires" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("comment.title")} ({comments.length})
          </h2>
          {commentsFailed && <p className="text-sm text-danger">{t("comment.loadError")}</p>}
          {!commentsFailed && comments.length === 0 && <p className="text-sm text-muted">{t("comment.empty")}</p>}
          <ul className="flex flex-col gap-4">
            {comments.map((comment) => {
              const author = people.get(comment.author_id);
              const name = author?.displayName || author?.username || unknown;
              const canDelete = comment.author_id === me || post.author_id === me;
              return (
                <li key={comment.id} className="flex gap-3">
                  <Avatar src={author?.avatarUrl ?? null} initial={initialsOf(name)} alt="" size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight">
                      {author?.username ? (
                        <Link href={`/u/${encodeURIComponent(author.username)}`} className="font-bold hover:underline">
                          @{author.username}
                        </Link>
                      ) : (
                        <span className="font-bold">{name}</span>
                      )}{" "}
                      <time dateTime={comment.created_at} className="text-xs text-muted">
                        {relativeTime(comment.created_at, language, new Date(loadedAt))}
                      </time>
                    </p>
                    <ExpandableText text={comment.body} backdrop="background" className="mt-0.5 text-sm" />
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setToDelete(comment);
                      }}
                      aria-label={t("comment.delete")}
                      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-accent-ink"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Champ de commentaire, fixé en bas */}
      <form onSubmit={send} className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto w-full max-w-[500px] border-t border-line bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          {sendError && (
            <p aria-live="polite" className="mb-2 text-xs text-danger">
              {sendError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="commentaire" className="sr-only">
              {t("comment.placeholder")}
            </label>
            <input
              id="commentaire"
              type="text"
              maxLength={COMMENT_BODY_MAX}
              placeholder={t("comment.placeholder")}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSendError("");
              }}
              className="min-h-12 min-w-0 flex-1 rounded-full border border-accent-ink/40 bg-surface px-4 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-busy={sending}
              aria-label={t("comment.send")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12l16-8-6 16-2.5-6.5z" />
              </svg>
            </button>
          </div>
          {draft.length > COMMENT_BODY_MAX - 50 && (
            <p className="mt-1 text-right text-xs text-muted">
              {draft.length}/{COMMENT_BODY_MAX}
            </p>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={toDelete !== null}
        title={t("comment.deleteTitle")}
        confirmLabel={t("post.delete")}
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!deleting) setToDelete(null);
        }}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>}
      </div>
    </main>
  );
}

function PageSkeleton() {
  const t = useT();
  return (
    <main className="bg-background text-foreground">
      <div role="status" aria-label={t("common.loading")} className="mx-auto w-full max-w-[500px] px-4 pt-20">
        <PostSkeleton />
      </div>
    </main>
  );
}
