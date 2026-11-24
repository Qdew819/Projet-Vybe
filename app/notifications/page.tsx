"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import { eventActionErrorKey } from "../../lib/events";
import { loadPeople, type Person } from "../../lib/follows";
import { useLanguage, useT, type MessageKey } from "../../lib/i18n";
import {
  NOTIFICATIONS_PAGE,
  fetchHiddenTypes,
  fetchNotifications,
  groupNotifications,
  markRead,
  type NotificationItem,
  type NotificationRow,
} from "../../lib/notifications";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { relativeTime } from "../../lib/time";
import { useMounted } from "../../lib/useMounted";

type Load = "loading" | "error" | "ready";
type Resolution = "accepted" | "refused";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FOLLOW_TYPES = ["follow_request", "new_follower", "follow_accepted"];

export default function Notifications() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();

  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [me, setMe] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  // Demandes traitées ici (Accepter / Refuser) : la ligne l'indique au lieu des boutons
  const [resolved, setResolved] = useState<Map<string, Resolution>>(new Map());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<NotificationItem | null>(null);

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

  // Profils des auteurs : une seule requête groupée pour les nouveaux identifiants
  const loadActors = useCallback(async (list: NotificationRow[], known: Map<string, Person>) => {
    const ids = [...new Set(list.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))].filter((id) => !known.has(id));
    if (ids.length === 0) return known;
    try {
      const found = await loadPeople(createClient(), ids);
      return new Map([...known, ...found.map((p) => [p.id, p] as const)]);
    } catch (err) {
      console.error("Lecture des profils impossible :", err);
      return known;
    }
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
      try {
        const hiddenTypes = await fetchHiddenTypes(supabase, uid);
        const page = await fetchNotifications(supabase, uid, hiddenTypes, null);
        const actors = await loadActors(page, new Map());
        setHidden(hiddenTypes);
        setRows(page);
        setPeople(actors);
        setHasMore(page.length === NOTIFICATIONS_PAGE);
        setLoadedAt(Date.now());
        setLoad("ready");
      } catch (err) {
        console.error(err);
        setLoad("error");
      }
    });
  }, [router, loadActors, attempt]);

  const items = useMemo(() => groupNotifications(rows), [rows]);
  const fresh = items.filter((i) => i.unread);
  const earlier = items.filter((i) => !i.unread);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(createClient(), me, hidden, last.created_at);
      setPeople(await loadActors(page, people));
      setRows((current) => [...current, ...page.filter((r) => !current.some((c) => c.id === r.id))]);
      setHasMore(page.length === NOTIFICATIONS_PAGE);
    } catch (err) {
      console.error(err);
      showToast(t("notif.loadError"));
    }
    setLoadingMore(false);
  }

  function setReadLocally(ids: string[] | null) {
    const now = new Date().toISOString();
    setRows((current) => current.map((r) => (r.read_at || (ids && !ids.includes(r.id)) ? r : { ...r, read_at: now })));
  }

  async function markAll() {
    setMarkingAll(true);
    const ok = await markRead(createClient(), null);
    setMarkingAll(false);
    if (ok) setReadLocally(null);
    else showToast(t("notif.actionError"));
  }

  // Clic sur une notification : marquée comme lue, puis on ouvre ce qu'elle concerne (s'il existe encore)
  async function open(item: NotificationItem) {
    const supabase = createClient();
    if (item.unread) {
      setReadLocally(item.ids);
      void markRead(supabase, item.ids);
    }
    const n = item.main;
    if (FOLLOW_TYPES.includes(n.type)) {
      const actor = n.actor_id ? people.get(n.actor_id) : undefined;
      if (!actor?.username) {
        showToast(t("notif.unavailable"));
        return;
      }
      router.push(`/u/${encodeURIComponent(actor.username)}`);
      return;
    }
    if ((n.type === "post_like" || n.type === "post_comment") && n.post_id) {
      const { data } = await supabase.from("posts").select("id").eq("id", n.post_id).maybeSingle();
      if (!data) showToast(t("notif.unavailable"));
      else router.push(`/publication/${n.post_id}`);
      return;
    }
    if (n.type.startsWith("event_") && n.event_id) {
      const { data } = await supabase.from("events").select("id").eq("id", n.event_id).maybeSingle();
      if (!data) showToast(t("notif.unavailable"));
      else router.push(`/evenements/${n.event_id}`);
      return;
    }
    showToast(t("notif.unavailable"));
  }

  // Demande d'abonnement : même logique que la page Communauté (follows : accepted ou suppression)
  async function answerFollow(item: NotificationItem, accept: boolean) {
    const actorId = item.main.actor_id;
    if (!actorId) return;
    setBusyKey(item.key);
    const supabase = createClient();
    const { data, error } = accept
      ? await supabase.from("follows").update({ status: "accepted" }).eq("follower_id", actorId).eq("followed_id", me).select("follower_id")
      : await supabase.from("follows").delete().eq("follower_id", actorId).eq("followed_id", me).select("follower_id");
    setBusyKey(null);
    if (error) {
      console.error(`Réponse à la demande impossible : ${error.message} (code ${error.code})`);
      showToast(t("privacy.actionError"));
      return;
    }
    // Plus de demande (déjà traitée ou annulée) : rien n'a changé
    if (!data || data.length === 0) {
      showToast(t("notif.unavailable"));
      return;
    }
    setResolved((current) => new Map(current).set(item.key, accept ? "accepted" : "refused"));
    showToast(accept ? t("people.requestAccepted") : t("people.requestRefused"));
    setReadLocally(item.ids);
    void markRead(supabase, item.ids);
  }

  // Demande de participation : RPC respond_to_join
  async function answerJoin(item: NotificationItem, accept: boolean) {
    const { actor_id: actorId, event_id: eventId } = item.main;
    if (!actorId || !eventId) return;
    setBusyKey(item.key);
    const supabase = createClient();
    const { error } = await supabase.rpc("respond_to_join", { p_event: eventId, p_user: actorId, p_accept: accept });
    setBusyKey(null);
    if (error) {
      if (`${error.message}`.includes("introuvable")) {
        showToast(t("notif.unavailable"));
      } else {
        console.error(`Réponse à la demande impossible : ${error.message} (code ${error.code})`);
        showToast(t(eventActionErrorKey(error)));
      }
      return;
    }
    setResolved((current) => new Map(current).set(item.key, accept ? "accepted" : "refused"));
    showToast(accept ? t("event.accepted") : t("event.refused"));
    setReadLocally(item.ids);
    void markRead(supabase, item.ids);
  }

  async function remove(item: NotificationItem) {
    const { error } = await createClient().from("notifications").delete().in("id", item.ids);
    if (error) {
      console.error(`Suppression impossible : ${error.message} (code ${error.code})`);
      showToast(t("notif.actionError"));
      return;
    }
    setRows((current) => current.filter((r) => !item.ids.includes(r.id)));
    showToast(t("notif.deleted"));
  }

  function renderItem(item: NotificationItem) {
    const actor = item.actorIds[0] ? people.get(item.actorIds[0]) : undefined;
    const name = actor?.username ? `@${actor.username}` : actor?.displayName || t("event.member");
    const resolution = resolved.get(item.key);
    const canAnswer = (item.type === "follow_request" || item.type === "event_join_request") && !resolution;
    return (
      <li key={item.key} className="rounded-2xl border border-line bg-surface">
        <div className="flex items-start gap-1 p-2">
          <button
            type="button"
            onClick={() => void open(item)}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <Avatar src={actor?.avatarUrl ?? null} initial={initialsOf(actor?.displayName || actor?.username || "?")} alt="" size={44} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug">
                <Describe item={item} name={name} />
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {item.unread && (
                  <>
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                    <span className="sr-only">{t("notif.unreadDot")}</span>
                  </>
                )}
                <time dateTime={item.main.created_at}>{relativeTime(item.main.created_at, language, new Date(loadedAt))}</time>
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMenuItem(item)}
            aria-haspopup="dialog"
            aria-label={t("notif.menu")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>

        {canAnswer && (
          <div className="grid grid-cols-2 gap-2 px-3 pb-3 pl-[4.25rem]">
            <button
              type="button"
              disabled={busyKey === item.key}
              onClick={() => void (item.type === "follow_request" ? answerFollow(item, true) : answerJoin(item, true))}
              aria-label={t("event.acceptPerson").replace("{name}", name)}
              className="min-h-11 rounded-full bg-accent text-sm font-bold text-on-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {t("event.accept")}
            </button>
            <button
              type="button"
              disabled={busyKey === item.key}
              onClick={() => void (item.type === "follow_request" ? answerFollow(item, false) : answerJoin(item, false))}
              aria-label={t("event.refusePerson").replace("{name}", name)}
              className="min-h-11 rounded-full border border-line text-sm font-bold text-muted transition-colors hover:text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {t("event.refuse")}
            </button>
          </div>
        )}
        {resolution && (
          <p className="px-3 pb-3 pl-[4.25rem] text-xs font-bold text-accent-ink">
            {resolution === "accepted" ? t("notif.acceptedDone") : t("notif.refusedDone")}
          </p>
        )}
      </li>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-4 pb-12 pt-4">
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
          <h1 className="min-w-0 flex-1 truncate text-xl font-black">{t("notif.title")}</h1>
          {load === "ready" && fresh.length > 0 && (
            <button
              type="button"
              onClick={markAll}
              disabled={markingAll}
              aria-busy={markingAll}
              className="min-h-11 shrink-0 rounded-full px-3 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-ink/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              {t("notif.markAll")}
            </button>
          )}
        </header>

        {load === "loading" && (
          <ul role="status" aria-label={t("common.loading")} className="mt-6 flex flex-col gap-2">
            {[0, 1, 2, 3].map((n) => (
              <li key={n} aria-hidden="true" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <div className="h-11 w-11 animate-pulse rounded-full bg-line" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-line" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-line" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {load === "error" && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-danger">{t("notif.loadError")}</p>
            <button
              type="button"
              onClick={() => {
                setLoad("loading");
                setAttempt((n) => n + 1);
              }}
              className="rounded-full border border-accent-ink px-5 py-2.5 text-sm font-bold text-accent-ink"
            >
              {t("eventForm.retry")}
            </button>
          </div>
        )}

        {load === "ready" && items.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted">
            <svg {...iconProps} className="h-12 w-12 text-accent-ink" strokeWidth={1.8}>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <p className="font-bold text-foreground">{t("notif.empty")}</p>
          </div>
        )}

        {load === "ready" && fresh.length > 0 && (
          <section aria-labelledby="notif-nouvelles" className="mt-6">
            <h2 id="notif-nouvelles" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("notif.new")}
            </h2>
            <ul className="flex flex-col gap-2">{fresh.map(renderItem)}</ul>
          </section>
        )}

        {load === "ready" && earlier.length > 0 && (
          <section aria-labelledby="notif-plus-tot" className="mt-6">
            <h2 id="notif-plus-tot" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("notif.earlier")}
            </h2>
            <ul className="flex flex-col gap-2">{earlier.map(renderItem)}</ul>
          </section>
        )}

        {load === "ready" && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            aria-busy={loadingMore}
            className="mt-6 min-h-12 w-full rounded-2xl border border-accent-ink text-sm font-bold text-accent-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {loadingMore ? t("common.loading") : t("feed.more")}
          </button>
        )}
      </div>

      <NotificationMenu item={menuItem} onClose={() => setMenuItem(null)} onDelete={(item) => void remove(item)} />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>}
      </div>
    </main>
  );
}

// ---------- Texte de chaque notification ----------

// Texte d'une notification : @pseudo en gras, titre d'événement et extrait entre guillemets français
function Describe({ item, name }: { item: NotificationItem; name: string }) {
  const t = useT();
  const title = item.main.data?.event_title ?? "";
  const snippet = item.main.data?.snippet ?? "";
  const who = <strong className="font-bold">{name}</strong>;
  const fill = (key: MessageKey) => t(key).replace("{title}", title).replace("{snippet}", snippet);
  const withActor = (key: MessageKey): ReactNode => (
    <>
      {who} {fill(key)}
    </>
  );

  switch (item.type) {
    case "follow_request":
      return withActor("notif.followRequest");
    case "new_follower":
      return withActor("notif.newFollower");
    case "follow_accepted":
      return withActor("notif.followAccepted");
    case "post_like": {
      const others = item.actorIds.length - 1;
      if (others <= 0) return withActor("notif.like");
      return (
        <>
          {who} {(others === 1 ? t("notif.likeOne") : t("notif.likeOthers")).replace("{n}", String(others))}
        </>
      );
    }
    case "post_comment":
      return withActor("notif.comment");
    case "event_join":
      return withActor("notif.eventJoin");
    case "event_join_request":
      return withActor("notif.eventJoinRequest");
    case "event_waitlist":
      return withActor("notif.eventWaitlist");
    case "event_request_accepted":
      return <>{fill("notif.requestAccepted")}</>;
    case "event_request_refused":
      return <>{fill("notif.requestRefused")}</>;
    case "event_waitlist_promoted":
      return <>{fill("notif.waitlistPromoted")}</>;
    case "event_removed":
      return <>{fill("notif.removed")}</>;
    case "event_announcement":
      return <>{fill("notif.announcement")}</>;
    case "event_cancelled":
      return <>{fill("notif.cancelled")}</>;
    default:
      return withActor("notif.other");
  }
}

// ---------- Menu « ⋯ » ----------

function NotificationMenu({
  item,
  onClose,
  onDelete,
}: {
  item: NotificationItem | null;
  onClose: () => void;
  onDelete: (item: NotificationItem) => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  // Garde la notification visée pendant la fermeture
  const target = useRef<NotificationItem | null>(null);
  const open = item !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      target.current = item;
      dialog.showModal();
      firstRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, item, mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("notif.menu")}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-[500px] rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <button
          ref={firstRef}
          type="button"
          onClick={() => {
            const chosen = target.current;
            dialogRef.current?.close();
            if (chosen) onDelete(chosen);
          }}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left font-bold text-danger transition-colors hover:border-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <svg {...iconProps} className="h-5 w-5" strokeWidth={2}>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
          {t("post.delete")}
        </button>
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
