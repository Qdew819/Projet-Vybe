"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCloseDialogOnHide } from "../lib/useCloseDialogOnHide";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import ImageCarousel from "./ImageCarousel";
import ExpandableText from "./ExpandableText";
import ReportDialog, { type ReportReason } from "./ReportDialog";
import ShareButton from "./ShareButton";
import VideoPlayer from "./VideoPlayer";
import { formatEventDate, type EventRow } from "../lib/events";
import type { Person } from "../lib/follows";
import { useLanguage, useT } from "../lib/i18n";
import { deletePost, setLike, type PostRow, type PostStats } from "../lib/posts";
import { initialsOf } from "../lib/profile";
import { postSharePath } from "../lib/share";
import { sportImage } from "../lib/sportImages";
import { createClient } from "../lib/supabase/client";
import { relativeTime } from "../lib/time";
import { useMounted } from "../lib/useMounted";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Confirm = "delete" | "block" | null;

// Publication du fil « Quoi de neuf ? » : auteur, texte, photos ou vidéo, événement lié, j'aime / commentaires / partage, menu « ⋯ ».
// Les compteurs viennent de post_stats (une requête pour toute la page) ; j'aime est mis à jour tout de suite.
export default function PostCard({
  post,
  author,
  stats,
  event,
  me,
  now,
  onMessage,
  onDeleted,
  onBlocked,
  commentsLink = true,
  fullText = false,
}: {
  post: PostRow;
  author?: Person;
  stats: PostStats;
  event?: EventRow;
  me: string;
  now: number; // heure de chargement, pour « il y a 2 h »
  onMessage: (text: string) => void;
  onDeleted: (post: PostRow) => void;
  onBlocked: (authorId: string) => void;
  commentsLink?: boolean; // false sur la page de la publication (on y est déjà)
  fullText?: boolean; // true : texte complet (vue détaillée) ; sinon coupé à 3 lignes avec « Montrer plus »
}) {
  const t = useT();
  const language = useLanguage();
  const [liked, setLiked] = useState(stats.likedByMe);
  const [likes, setLikes] = useState(stats.likes);
  const [likeBusy, setLikeBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const mine = post.author_id === me;
  const name = author?.displayName || author?.username || t("event.member");
  const handle = author?.username ? `@${author.username}` : "";
  const images = post.image_urls ?? [];
  const isVideo = Boolean(post.video_url);
  const format = new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", { notation: "compact" });

  async function toggleLike() {
    if (likeBusy) return;
    const next = !liked;
    setLikeBusy(true);
    // Mise à jour optimiste
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    const ok = await setLike(createClient(), post.id, me, next);
    if (!ok) {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      onMessage(t("post.likeError"));
    }
    setLikeBusy(false);
  }

  async function confirmAction() {
    setConfirmBusy(true);
    setConfirmError("");
    const supabase = createClient();
    if (confirm === "delete") {
      const ok = await deletePost(supabase, post);
      setConfirmBusy(false);
      if (!ok) {
        setConfirmError(t("post.deleteError"));
        return;
      }
      setConfirm(null);
      onMessage(t("post.deleted"));
      onDeleted(post);
      return;
    }
    // Blocage : même mécanisme que sur la page profil (la base retire les abonnements dans les deux sens)
    const { error } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: post.author_id });
    setConfirmBusy(false);
    if (error && error.code !== "23505") {
      console.error(`Blocage impossible : ${error.message} (code ${error.code})`);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    setConfirm(null);
    setReporting(false);
    onMessage(t("post.blocked").replace("{name}", handle || name));
    onBlocked(post.author_id);
  }

  // Signalement : même table que pour un profil ; la publication est précisée dans les détails
  async function report(reason: ReportReason, details: string): Promise<string | null> {
    const text = `Publication ${post.id}${details ? ` — ${details}` : ""}`;
    const { error } = await createClient().from("reports").insert({ reporter_id: me, reported_id: post.author_id, reason, details: text });
    if (error) {
      console.error(`Signalement impossible : ${error.message} (code ${error.code})`);
      return t("report.error");
    }
    return null;
  }

  return (
    <article aria-label={t("home.postBy").replace("{name}", name)} className="rounded-2xl border border-line bg-surface p-3">
      <header className="flex items-center gap-3">
        <Avatar src={author?.avatarUrl ?? null} initial={initialsOf(name)} alt="" size={44} neon />
        <div className="min-w-0 flex-1">
          {author?.username ? (
            <Link
              href={`/u/${encodeURIComponent(author.username)}`}
              className="block truncate rounded leading-tight hover:underline focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              <span className="font-bold">{name}</span> <span className="text-sm text-muted">{handle}</span>
            </Link>
          ) : (
            <p className="truncate font-bold leading-tight">{name}</p>
          )}
          <p className="text-xs text-muted">
            <time dateTime={post.created_at}>{relativeTime(post.created_at, language, new Date(now))}</time>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          aria-label={t("post.menu")}
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </header>

      {/* Publication avec vidéo : le texte est tout en bas, sous les actions (style Instagram) */}
      {!isVideo &&
        post.body?.trim() &&
        (fullText ? (
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-snug">{post.body}</p>
        ) : (
          <ExpandableText text={post.body} className="mt-3 text-sm leading-snug" />
        ))}

      {post.video_url ? (
        <VideoPlayer
          postId={post.id}
          src={post.video_url}
          poster={post.video_poster_url ?? null}
          duration={post.video_duration_s ?? null}
        />
      ) : (
        images.length > 0 && (
          // Une photo à la fois, on glisse pour les suivantes ; un toucher simple l'ouvre en grand
          <ImageCarousel images={images} onOpen={setViewer} openLabel={t("post.openPhoto")} className="mt-3" />
        )
      )}

      {event && <LinkedEvent event={event} />}

      <div className="mt-1 flex items-center gap-1">
        <Action
          label={liked ? t("post.unlike") : t("post.like")}
          pressed={liked}
          count={format.format(likes)}
          onClick={toggleLike}
          active={liked}
        >
          <path
            d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 3 1.3-1.9 2.9-3 4.9-3 3.5 0 5.4 3.5 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
            fill={liked ? "currentColor" : "none"}
          />
        </Action>
        {commentsLink ? (
          <Link
            href={`/publication/${post.id}`}
            aria-label={t("post.commentsCount").replace("{n}", String(stats.comments))}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg {...iconProps} className="h-5 w-5">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
            </svg>
            <span className="tabular-nums">{format.format(stats.comments)}</span>
          </Link>
        ) : (
          <span className="flex min-h-11 items-center gap-1.5 px-2.5 text-sm font-semibold text-muted">
            <svg {...iconProps} className="h-5 w-5">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
            </svg>
            <span className="tabular-nums">{format.format(stats.comments)}</span>
          </span>
        )}
        {/* « Envoyer » : feuille de partage du téléphone (lien court /p/<id>) */}
        <ShareButton
          variant="icon"
          url={postSharePath(post.id)}
          title={t("post.shareTitle").replace("{name}", name)}
          text={
            post.body?.trim()
              ? t("share.postText")
                  .replace("{name}", name)
                  .replace("{excerpt}", post.body.trim().length > 100 ? `${post.body.trim().slice(0, 99).trimEnd()}…` : post.body.trim())
              : t("share.postTextNoBody").replace("{name}", name)
          }
          className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
        />
        {/* Vues (publications avec vidéo) : en bas à droite, visibles par l'auteur et par tout le monde */}
        {post.video_url && (
          <span className="ml-auto flex min-h-11 items-center gap-1.5 px-2.5 text-xs font-semibold text-muted">
            <svg {...iconProps} className="h-4 w-4">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="tabular-nums">
              {((language === "en" ? stats.views === 1 : stats.views < 2) ? t("video.view") : t("video.views")).replace(
                "{n}",
                format.format(stats.views)
              )}
            </span>
          </span>
        )}
      </div>

      {/* Vidéo : nom de l'auteur en gras puis le texte, coupé à 2 lignes (« Montrer plus » seulement s'il dépasse) */}
      {isVideo && post.body?.trim() && (
        <ExpandableText
          text={post.body.trim()}
          lines={2}
          prefix={<span className="font-bold">{name}</span>}
          className="px-1 text-sm leading-snug text-foreground"
        />
      )}

      <PostMenu
        open={menuOpen}
        mine={mine}
        handle={handle || name}
        onClose={() => setMenuOpen(false)}
        onDelete={() => {
          setConfirmError("");
          setConfirm("delete");
        }}
        onReport={() => setReporting(true)}
        onBlock={() => {
          setConfirmError("");
          setConfirm("block");
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? t("post.deleteTitle") : t("post.blockTitle").replace("{name}", handle || name)}
        description={confirm === "delete" ? t("post.deleteText") : t("post.blockText")}
        confirmLabel={confirm === "delete" ? t("post.delete") : t("post.block")}
        danger
        busy={confirmBusy}
        error={confirmError}
        onConfirm={() => void confirmAction()}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />

      {!mine && (
        <ReportDialog
          open={reporting}
          username={author?.username ?? name}
          onSubmit={report}
          onBlock={() => {
            setConfirmError("");
            setConfirm("block");
          }}
          onClose={() => setReporting(false)}
        />
      )}

      <PhotoViewer images={images} index={viewer} onChange={setViewer} />
    </article>
  );
}

// ---------- Photos ----------

// Photo en grand (fenêtre modale), avec précédente / suivante
function PhotoViewer({ images, index, onChange }: { images: string[]; index: number | null; onChange: (index: number | null) => void }) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const open = index !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, mounted]);

  if (!mounted) return null;
  const current = index ?? 0;
  const navButton =
    "absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-2 focus-visible:outline-white";
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("post.photoViewer")}
      onClose={() => onChange(null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && current < images.length - 1) onChange(current + 1);
        if (e.key === "ArrowLeft" && current > 0) onChange(current - 1);
      }}
      className="m-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/90"
    >
      {open && images[current] && (
        <div className="relative flex h-full w-full items-center justify-center" onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}>
          {/* eslint-disable-next-line @next/next/no-img-element -- photo en taille réelle, sans recadrage */}
          <img src={images[current]} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg {...iconProps} className="h-6 w-6" strokeWidth={2.5}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {current > 0 && (
            <button type="button" onClick={() => onChange(current - 1)} aria-label={t("post.previousPhoto")} className={`${navButton} left-3`}>
              <svg {...iconProps} className="h-6 w-6" strokeWidth={2.5}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          {current < images.length - 1 && (
            <button type="button" onClick={() => onChange(current + 1)} aria-label={t("post.nextPhoto")} className={`${navButton} right-3`}>
              <svg {...iconProps} className="h-6 w-6" strokeWidth={2.5}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          {images.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">
              {current + 1} / {images.length}
            </p>
          )}
        </div>
      )}
    </dialog>,
    document.body
  );
}

// ---------- Événement lié ----------

function LinkedEvent({ event }: { event: EventRow }) {
  const language = useLanguage();
  const image = event.cover_url || sportImage(event.sport);
  const place = [event.venue_name, event.city].filter(Boolean).join(", ");
  return (
    <Link
      href={`/evenements/${event.id}`}
      className="mt-3 flex items-center gap-3 rounded-xl border border-accent-ink/40 bg-background p-2 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-[linear-gradient(135deg,#020702,#0b3d12)]">
        {image && <Image src={image} alt="" fill unoptimized={image.startsWith("http")} sizes="64px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{event.title}</span>
        <span className="block truncate text-xs text-muted">{formatEventDate(event.starts_at, language)}</span>
        <span className="block truncate text-xs text-muted">{place}</span>
      </span>
      <svg {...iconProps} className="h-5 w-5 shrink-0 text-accent-ink" strokeWidth={2.5}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

// ---------- Actions ----------

function Action({
  label,
  count,
  pressed,
  active = false,
  onClick,
  children,
}: {
  label: string;
  count?: string;
  pressed?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${
        active ? "text-accent-ink" : "text-muted hover:text-foreground"
      }`}
    >
      <svg {...iconProps} className="h-5 w-5">
        {children}
      </svg>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

// Menu « ⋯ » : feuille qui monte du bas (Supprimer pour mes publications, sinon Signaler et Bloquer).
// Exporté : aussi utilisé par le fil de vidéos plein écran (components/videos/ReelItem.tsx)
export function PostMenu({
  open,
  mine,
  handle,
  onClose,
  onDelete,
  onReport,
  onBlock,
}: {
  open: boolean;
  mine: boolean;
  handle: string;
  onClose: () => void;
  onDelete: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      firstRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, mounted]);

  if (!mounted) return null;
  const option =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";
  const choose = (action: () => void) => {
    dialogRef.current?.close();
    action();
  };
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("post.menu")}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-[500px] rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        {mine ? (
          <button ref={firstRef} type="button" onClick={() => choose(onDelete)} className={`${option} text-danger hover:border-danger focus-visible:outline-danger`}>
            <svg {...iconProps} className="h-5 w-5">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
            {t("post.delete")}
          </button>
        ) : (
          <>
            <button ref={firstRef} type="button" onClick={() => choose(onReport)} className={`${option} hover:border-accent-ink focus-visible:outline-accent-ink`}>
              <svg {...iconProps} className="h-5 w-5">
                <path d="M5 21V4h11l-1.5 4L16 12H5" />
              </svg>
              {t("post.report")}
            </button>
            <button type="button" onClick={() => choose(onBlock)} className={`${option} text-danger hover:border-danger focus-visible:outline-danger`}>
              <svg {...iconProps} className="h-5 w-5">
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" />
              </svg>
              {t("post.blockPerson").replace("{name}", handle)}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="min-h-12 w-full rounded-2xl text-sm font-bold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {t("common.cancel")}
        </button>
      </div>
    </dialog>,
    document.body
  );
}
