"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Avatar from "../Avatar";
import ConfirmDialog from "../ConfirmDialog";
import ExpandableText from "../ExpandableText";
import { loadPeople, type Person } from "../../lib/follows";
import { useLanguage, useT } from "../../lib/i18n";
import { COMMENT_BODY_MAX, COMMENT_COLUMNS, postErrorKey, type CommentRow } from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { relativeTime } from "../../lib/time";
import { useCloseDialogOnHide } from "../../lib/useCloseDialogOnHide";
import { useMounted } from "../../lib/useMounted";

const COMMENTS_LIMIT = 200;
const SWIPE_CLOSE_PX = 90;

type Load = "loading" | "error" | "ready";

// Feuille des commentaires du fil de vidéos : monte du bas sur ~70 % de l'écran, la vidéo continue au-dessus.
// Même logique que la page /publication/[id] (lecture, envoi, suppression, limite_commentaires).
// Se ferme avec la croix, un clic au-dessus de la feuille, Échap, ou en la faisant glisser vers le bas.
// Montée seulement quand elle est ouverte (le parent la retire à la fermeture).
export default function CommentsSheet({
  postId,
  postAuthorId,
  me,
  onClose,
  onCountChange,
  onMessage,
}: {
  postId: string;
  postAuthorId: string;
  me: string;
  onClose: () => void;
  onCountChange: (delta: number) => void;
  onMessage: (text: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [loadedAt, setLoadedAt] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [toDelete, setToDelete] = useState<CommentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [mounted]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("post_comments")
        .select(COMMENT_COLUMNS)
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(COMMENTS_LIMIT);
      if (cancelled) return;
      if (error) {
        console.error(`Lecture des commentaires impossible : ${error.message} (code ${error.code})`);
        setLoad("error");
        return;
      }
      const list = (data ?? []) as CommentRow[];
      const authors = await loadPeople(supabase, [...new Set([...list.map((c) => c.author_id), me])]).catch(() => [] as Person[]);
      if (cancelled) return;
      setComments(list);
      setPeople(new Map(authors.map((p) => [p.id, p])));
      setLoadedAt(Date.now());
      setLoad("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, me, attempt]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError("");
    const { data, error } = await createClient()
      .from("post_comments")
      .insert({ post_id: postId, author_id: me, body: text })
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
    setDraft("");
    onCountChange(1);
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
    setToDelete(null);
    onCountChange(-1);
    onMessage(t("comment.deleted"));
  }

  // Glisser la poignée vers le bas pour fermer
  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  }
  function onDragEnd() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > SWIPE_CLOSE_PX) dialogRef.current?.close();
    else setDrag(0);
  }

  if (!mounted) return null;
  const unknown = t("event.member");
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("reels.commentsSheet")}
      onClose={onClose}
      onClick={(e) => {
        // Clic au-dessus de la feuille (sur la vidéo) : on ferme
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto h-[70dvh] max-h-none w-full max-w-[480px] overflow-visible bg-transparent p-0 text-foreground backdrop:bg-black/20"
    >
      <div
        ref={panelRef}
        className="flex h-full flex-col rounded-t-3xl border border-b-0 border-line bg-background"
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform 0.2s ease-out" }}
      >
        {/* Poignée et titre : zone à faire glisser */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="shrink-0 touch-none px-4 pt-3"
        >
          <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-base font-bold">
              {t("comment.title")} {load === "ready" && <span className="text-muted">({comments.length})</span>}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={t("common.close")}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          {load === "loading" && (
            <ul aria-hidden="true" className="flex flex-col gap-4 pt-2">
              {[0, 1, 2].map((n) => (
                <li key={n} className="flex gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-surface" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {load === "error" && (
            <p className="flex flex-wrap items-center gap-x-3 pt-2 text-sm text-danger">
              {t("comment.loadError")}
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
          {load === "ready" && comments.length === 0 && <p className="pt-6 text-center text-sm text-muted">{t("comment.empty")}</p>}
          {load === "ready" && comments.length > 0 && (
            <ul className="flex flex-col gap-4 pt-2">
              {comments.map((comment) => {
                const author = people.get(comment.author_id);
                const name = author?.displayName || author?.username || unknown;
                const canDelete = comment.author_id === me || postAuthorId === me;
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
                      <ExpandableText text={comment.body} lines={3} backdrop="background" className="mt-0.5 text-sm" />
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
          )}
        </div>

        <form onSubmit={send} className="shrink-0 border-t border-line px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          {sendError && (
            <p aria-live="polite" className="mb-2 text-xs text-danger">
              {sendError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="commentaire-video" className="sr-only">
              {t("comment.placeholder")}
            </label>
            <input
              id="commentaire-video"
              type="text"
              maxLength={COMMENT_BODY_MAX}
              placeholder={t("comment.placeholder")}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSendError("");
              }}
              className="min-h-12 min-w-0 flex-1 rounded-full border border-accent-ink/40 bg-surface px-4 text-base text-foreground outline-none placeholder:text-subtle focus:border-accent-ink"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-busy={sending}
              aria-label={t("comment.send")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#39ff14] text-black transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
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
        </form>
      </div>

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
    </dialog>,
    document.body
  );
}
