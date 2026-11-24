"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ConfirmDialog from "../ConfirmDialog";
import ExpandableText from "../ExpandableText";
import { PostMenu } from "../PostCard";
import ReportDialog, { type ReportReason } from "../ReportDialog";
import ShareButton from "../ShareButton";
import { formatEventDate } from "../../lib/events";
import { followUser, type FollowStatus } from "../../lib/follows";
import { useLanguage, useT } from "../../lib/i18n";
import { deletePost, setLike, type PostRow, type PostStats } from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { postSharePath } from "../../lib/share";
import { createClient } from "../../lib/supabase/client";
import type { Reel } from "../../lib/videoFeed";
import { recordView } from "../../lib/videos";

const DOUBLE_TAP_MS = 280;
const VIEW_AFTER_SECONDS = 2;
const VERTICAL_RATIO = 0.8; // largeur / hauteur en dessous de laquelle la vidéo remplit l'écran (cover)

// Onglet caché ou non (false au premier rendu : rien ne dépend du navigateur pendant l'hydratation)
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
function usePageHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}

// Le navigateur autorise-t-il le son ? (une interaction a déjà eu lieu dans la page, ex. le clic sur la carte)
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const HEART = "M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 3 1.3-1.9 2.9-3 4.9-3 3.5 0 5.4 3.5 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3z";

type Confirm = "delete" | "block" | null;

// Une vidéo du fil plein écran. live : vidéo montée (courante, précédente ou deux suivantes) ; sinon seulement l'affiche.
export default function ReelItem({
  reel,
  me,
  active,
  live,
  preload,
  soundOn,
  sport,
  onSoundBlocked,
  onStatsChange,
  onFollowChange,
  onOpenComments,
  onDeleted,
  onBlocked,
  onMessage,
}: {
  reel: Reel;
  me: string;
  active: boolean;
  live: boolean;
  preload: "auto" | "none";
  soundOn: boolean;
  sport: { name: string; emoji: string } | null;
  onSoundBlocked: () => void;
  onStatsChange: (postId: string, stats: PostStats) => void;
  onFollowChange: (authorId: string, status: FollowStatus) => void;
  onOpenComments: (post: PostRow) => void;
  onDeleted: (post: PostRow) => void;
  onBlocked: (authorId: string) => void;
  onMessage: (text: string) => void;
}) {
  const { post } = reel;
  const poster = post.video_poster_url ?? null;
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Affiche floutée en fond : visible pendant le chargement et sur les bords d'une vidéo horizontale */}
      {poster && (
        <Image src={poster} alt="" fill unoptimized sizes="480px" className="scale-110 object-cover opacity-50 blur-2xl" aria-hidden="true" />
      )}
      {live ? (
        <LiveReel
          reel={reel}
          me={me}
          active={active}
          preload={preload}
          soundOn={soundOn}
          sport={sport}
          onSoundBlocked={onSoundBlocked}
          onStatsChange={onStatsChange}
          onFollowChange={onFollowChange}
          onOpenComments={onOpenComments}
          onDeleted={onDeleted}
          onBlocked={onBlocked}
          onMessage={onMessage}
        />
      ) : (
        poster && <Image src={poster} alt="" fill unoptimized sizes="480px" className="object-contain" />
      )}
    </div>
  );
}

function LiveReel({
  reel,
  me,
  active,
  preload,
  soundOn,
  sport,
  onSoundBlocked,
  onStatsChange,
  onFollowChange,
  onOpenComments,
  onDeleted,
  onBlocked,
  onMessage,
}: Omit<Parameters<typeof ReelItem>[0], "live">) {
  const t = useT();
  const language = useLanguage();
  const { post, author, stats, event } = reel;
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hidden = usePageHidden();
  const [paused, setPaused] = useState(false); // mise en pause à la main
  const [wasActive, setWasActive] = useState(active);
  const [failed, setFailed] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [flash, setFlash] = useState<{ id: number; playing: boolean } | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [likeBusy, setLikeBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [reporting, setReporting] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const watched = useRef(0);
  const lastTime = useRef(0);
  const counted = useRef(false);

  // On quitte la vidéo : la pause manuelle est oubliée (elle repart quand on y revient)
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setPaused(false);
  }

  const mine = post.author_id === me;
  const name = author?.displayName || author?.username || t("event.member");
  const handle = author?.username ? `@${author.username}` : name;
  const format = new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", { notation: "compact" });
  const shouldPlay = active && !paused && !failed && !hidden;

  // Lecture : seulement la vidéo courante ; son si demandé et autorisé, sinon muet
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    const withSound = soundOn && hasUserActivation();
    video.muted = !withSound;
    video.play().catch(() => {
      if (!video.muted) {
        // Son refusé par le navigateur : on relance en muet
        video.muted = true;
        onSoundBlocked();
        video.play().catch(() => undefined);
      }
    });
  }, [shouldPlay, soundOn, onSoundBlocked]);

  // Page quittée (cachée par Next avec <Activity>, pas démontée) ou vidéo démontée : pause, sinon le son continuerait
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, []);

  // Barre de progression : suit la lecture image par image (écrite directement, sans rendu React)
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      const bar = barRef.current;
      if (video && bar && video.duration > 0) bar.style.transform = `scaleX(${video.currentTime / video.duration})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, []);

  // Vue comptée après 2 s de lecture cumulées (les sauts et le retour au début de la boucle ne comptent pas)
  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const delta = video.currentTime - lastTime.current;
    lastTime.current = video.currentTime;
    if (counted.current || delta <= 0 || delta > 1) return;
    watched.current += delta;
    if (watched.current >= VIEW_AFTER_SECONDS) {
      counted.current = true;
      recordView(createClient(), post.id);
    }
  }

  async function like(next: boolean) {
    if (likeBusy || next === stats.likedByMe) return;
    setLikeBusy(true);
    const before = stats;
    onStatsChange(post.id, { ...stats, likedByMe: next, likes: Math.max(0, stats.likes + (next ? 1 : -1)) });
    const ok = await setLike(createClient(), post.id, me, next);
    if (!ok) {
      onStatsChange(post.id, before);
      onMessage(t("post.likeError"));
    }
    setLikeBusy(false);
  }

  // Toucher : pause / lecture ; double-toucher : j'aime (jamais retiré) avec un cœur au centre
  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setHearts((current) => [...current, now]);
      setTimeout(() => setHearts((current) => current.filter((h) => h !== now)), 900);
      void like(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      const next = !paused;
      setPaused(next);
      const id = Date.now();
      setFlash({ id, playing: !next });
      // Minuteur plutôt que animationend : sans animation (mouvements réduits), l'icône doit aussi disparaître
      setTimeout(() => setFlash((current) => (current?.id === id ? null : current)), 600);
    }, DOUBLE_TAP_MS);
  }

  async function follow() {
    if (followBusy || !author) return;
    setFollowBusy(true);
    try {
      const status = await followUser(createClient(), me, author.id);
      onFollowChange(author.id, status);
      onMessage(status === "accepted" ? t("reels.followed").replace("{name}", handle) : t("reels.requested").replace("{name}", handle));
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Déjà abonné (double clic) : on relit l'état comme accepté
      if (code === "23505") onFollowChange(author.id, "accepted");
      else {
        console.error("Abonnement impossible :", err);
        onMessage(t("reels.followError"));
      }
    }
    setFollowBusy(false);
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
    const { error } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: post.author_id });
    setConfirmBusy(false);
    if (error && error.code !== "23505") {
      console.error(`Blocage impossible : ${error.message} (code ${error.code})`);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    setConfirm(null);
    setReporting(false);
    onMessage(t("post.blocked").replace("{name}", handle));
    onBlocked(post.author_id);
  }

  async function report(reason: ReportReason, details: string): Promise<string | null> {
    const text = `Publication ${post.id}${details ? ` — ${details}` : ""}`;
    const { error } = await createClient().from("reports").insert({ reporter_id: me, reported_id: post.author_id, reason, details: text });
    if (error) {
      console.error(`Signalement impossible : ${error.message} (code ${error.code})`);
      return t("report.error");
    }
    return null;
  }

  const body = post.body?.trim() ?? "";
  const shareText = body
    ? t("share.postText").replace("{name}", name).replace("{excerpt}", body.length > 100 ? `${body.slice(0, 99).trimEnd()}…` : body)
    : t("share.postTextNoBody").replace("{name}", name);
  const sideButton =
    "flex flex-col items-center gap-1 text-xs font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <>
      <video
        ref={videoRef}
        src={post.video_url ?? undefined}
        poster={post.video_poster_url ?? undefined}
        preload={preload}
        playsInline
        muted
        loop
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          if (video.videoWidth && video.videoHeight) setFit(video.videoWidth / video.videoHeight <= VERTICAL_RATIO ? "cover" : "contain");
        }}
        onTimeUpdate={onTimeUpdate}
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />

      {/* Zone de toucher (sous l'interface) */}
      {!failed && (
        <button
          type="button"
          onClick={onTap}
          aria-label={paused ? t("video.play") : t("video.pause")}
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#39ff14]"
        />
      )}

      {/* Dégradés de lisibilité (ne bloquent aucun clic) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-linear-to-b from-black/60 to-transparent" />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/85 via-black/40 to-transparent transition-[height] ${
          captionOpen ? "h-3/4" : "h-1/2"
        }`}
      />

      {/* Icône lecture / pause qui apparaît brièvement, et cœurs du double-toucher */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        {flash && (
          <span
            key={flash.id}
            className="reel-flash flex h-20 w-20 items-center justify-center rounded-full bg-black/50 text-white"
          >
            {flash.playing ? (
              <svg viewBox="0 0 24 24" className="ml-1 h-10 w-10" fill="currentColor">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </span>
        )}
        {hearts.map((id) => (
          <svg key={id} viewBox="0 0 24 24" className="reel-heart absolute h-28 w-28 text-[#39ff14] drop-shadow-[0_0_24px_rgba(57,255,20,0.7)]" fill="currentColor">
            <path d={HEART} />
          </svg>
        ))}
      </div>

      {failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <p className="font-bold">{t("video.unavailable")}</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              videoRef.current?.load();
            }}
            className="min-h-11 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("eventForm.retry")}
          </button>
        </div>
      )}

      {/* Colonne d'actions à droite */}
      <div className="absolute bottom-24 right-2 z-20 flex flex-col items-center gap-5">
        <div className="relative mb-2">
          {author?.username ? (
            <Link
              href={`/u/${encodeURIComponent(author.username)}`}
              aria-label={t("reels.profileOf").replace("{name}", handle)}
              className="block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Avatar src={author.avatarUrl} initial={initialsOf(name)} alt="" size={48} neon />
            </Link>
          ) : (
            <Avatar src={author?.avatarUrl ?? null} initial={initialsOf(name)} alt="" size={48} neon />
          )}
          {!mine && reel.follow === null && author && (
            <button
              type="button"
              onClick={() => void follow()}
              disabled={followBusy}
              aria-busy={followBusy}
              aria-label={t("reels.follow").replace("{name}", handle)}
              className="absolute -bottom-2.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-[#39ff14] text-black shadow disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <svg {...iconProps} className="h-4 w-4" strokeWidth={3}>
                <path d="M12 6v12M6 12h12" />
              </svg>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void like(!stats.likedByMe)}
          aria-pressed={stats.likedByMe}
          aria-label={stats.likedByMe ? t("post.unlike") : t("post.like")}
          className={sideButton}
        >
          <svg {...iconProps} className={`h-8 w-8 ${stats.likedByMe ? "text-[#39ff14]" : ""}`}>
            <path d={HEART} fill={stats.likedByMe ? "currentColor" : "none"} />
          </svg>
          <span className="tabular-nums">{format.format(stats.likes)}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenComments(post)}
          aria-haspopup="dialog"
          aria-label={t("post.commentsCount").replace("{n}", String(stats.comments))}
          className={sideButton}
        >
          <svg {...iconProps} className="h-8 w-8">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
          </svg>
          <span className="tabular-nums">{format.format(stats.comments)}</span>
        </button>

        <ShareButton
          variant="icon"
          url={postSharePath(post.id)}
          title={t("post.shareTitle").replace("{name}", name)}
          text={shareText}
          className={`${sideButton} [&_svg]:h-8 [&_svg]:w-8`}
        />

        <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-label={t("post.menu")} className={sideButton}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* Auteur, légende, sport et événement, en bas à gauche */}
      <div className="absolute bottom-6 left-3 right-20 z-20 flex flex-col gap-2 text-white">
        <p className="flex min-w-0 items-center gap-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {author?.username ? (
            <Link href={`/u/${encodeURIComponent(author.username)}`} className="truncate font-bold hover:underline focus-visible:outline-2 focus-visible:outline-white">
              {handle}
            </Link>
          ) : (
            <span className="truncate font-bold">{handle}</span>
          )}
          {reel.creator && (
            <span className="shrink-0 rounded-full bg-[#39ff14] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">
              {t("reels.creator")}
            </span>
          )}
        </p>
        {body && (
          <div data-scrollable className={captionOpen ? "max-h-[40dvh] overflow-y-auto overscroll-contain" : ""}>
            <ExpandableText
              key={post.id}
              text={body}
              lines={2}
              backdrop="video"
              onExpandedChange={setCaptionOpen}
              className="text-sm leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            />
          </div>
        )}
        {(sport || event) && (
          <div className="flex flex-col items-start gap-2">
            {sport && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-bold backdrop-blur-sm">
                <span aria-hidden="true">{sport.emoji}</span>
                {sport.name}
              </span>
            )}
            {event && (
              <Link
                href={`/evenements/${event.id}`}
                aria-label={t("reels.eventLink").replace("{title}", event.title)}
                className="flex max-w-full items-center gap-2 rounded-xl border border-[#39ff14]/50 bg-black/50 px-3 py-2 backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white"
              >
                <svg {...iconProps} className="h-4 w-4 shrink-0 text-[#39ff14]" strokeWidth={2.2}>
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{event.title}</span>
                  <span className="block truncate text-[11px] text-white/75">{formatEventDate(event.starts_at, language)}</span>
                </span>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Barre de progression fine, en bas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/20">
        <div ref={barRef} className="h-full origin-left bg-[#39ff14]" style={{ transform: "scaleX(0)" }} />
      </div>

      <PostMenu
        open={menuOpen}
        mine={mine}
        handle={handle}
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
        title={confirm === "delete" ? t("post.deleteTitle") : t("post.blockTitle").replace("{name}", handle)}
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
    </>
  );
}

export function ReelSkeleton({ poster, children }: { poster?: string | null; children?: ReactNode }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {poster && <Image src={poster} alt="" fill unoptimized sizes="480px" className="object-cover opacity-60" />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/80 to-transparent" />
      <div aria-hidden="true" className="absolute bottom-8 left-3 flex w-2/3 flex-col gap-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/20" />
        <div className="h-3 w-full animate-pulse rounded bg-white/15" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-white/15" />
      </div>
      <div aria-hidden="true" className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-10 w-10 animate-pulse rounded-full bg-white/15" />
        ))}
      </div>
      {children}
    </div>
  );
}
