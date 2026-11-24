"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import EventCard, { EventCardSkeleton, type CardRole } from "../../components/EventCard";
import EventManageSheet from "../../components/EventManageSheet";
import EventsEmptyState from "../../components/EventsEmptyState";
import {
  EVENT_COLUMNS,
  deleteEvent,
  fetchGoingCounts,
  fetchMyPlace,
  fetchMyStatuses,
  fetchUpcomingEvents,
  joinEvent,
  rankByProximity,
  type EventRow,
  type ParticipantStatus,
} from "../../lib/events";
import { useT } from "../../lib/i18n";
import { sportImage } from "../../lib/sportImages";
import { createClient } from "../../lib/supabase/client";
import { fetchCatalog, type CatalogSport } from "../../lib/userSports";

type Tab = "upcoming" | "mine";
type Load = "loading" | "error" | "ready";

const UPCOMING_LIMIT = 30;
const MINE_LIMIT = 50;

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function Evenements() {
  const router = useRouter();
  const t = useT();

  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [sportFilter, setSportFilter] = useState<string | null>(null);

  const [me, setMe] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [mine, setMine] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, ParticipantStatus>>(new Map());
  const [joining, setJoining] = useState<string | null>(null);
  // « Gérer » : événement dont le menu Modifier / Supprimer est ouvert, puis celui à supprimer
  const [managed, setManaged] = useState<EventRow | null>(null);
  const [toDelete, setToDelete] = useState<EventRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string) => {
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
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

      // Arrivée après une création ou une suppression : message, onglet « Mes événements », adresse nettoyée
      const query = new URLSearchParams(window.location.search);
      const created = query.get("cree");
      const deleted = query.get("supprime");
      if (created || deleted) {
        if (created) setTab("mine");
        showToast(
          deleted ? t("events.deleted") : created === "sans-adresse" ? t("eventForm.createdNoAddress") : t("eventForm.created")
        );
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }

      const now = Date.now();
      setLoadedAt(now);
      const [catalogResult, ageResult, myStatuses, organizedResult, upcomingResult, place] = await Promise.all([
        fetchCatalog(supabase).then(
          (sports) => ({ data: sports, error: null }),
          (err: unknown) => ({ data: null, error: err })
        ),
        supabase.rpc("get_age", { uid }),
        fetchMyStatuses(supabase, uid),
        supabase.from("events").select(EVENT_COLUMNS).eq("organizer_id", uid).order("starts_at", { ascending: false }).limit(MINE_LIMIT),
        fetchUpcomingEvents(supabase, UPCOMING_LIMIT, now).then(
          (rows) => ({ data: rows, error: null }),
          (err: unknown) => ({ data: null, error: err })
        ),
        fetchMyPlace(supabase, uid),
      ]);

      if (organizedResult.error || upcomingResult.error || !upcomingResult.data) {
        console.error("Lecture des événements impossible :", organizedResult.error ?? upcomingResult.error);
        setLoad("error");
        return;
      }
      if (catalogResult.data) setCatalog(catalogResult.data);
      else console.error(catalogResult.error);
      if (!ageResult.error && typeof ageResult.data === "number") setAge(ageResult.data);
      setStatuses(myStatuses);

      // Événements où je suis inscrit sans les organiser
      const organized = (organizedResult.data ?? []) as EventRow[];
      const organizedIds = new Set(organized.map((e) => e.id));
      const joinedIds = [...myStatuses.keys()].filter((id) => !organizedIds.has(id));
      let joined: EventRow[] = [];
      if (joinedIds.length > 0) {
        const { data: joinedRows, error } = await supabase.from("events").select(EVENT_COLUMNS).in("id", joinedIds);
        if (error) console.error(`Lecture de mes inscriptions impossible : ${error.message} (code ${error.code})`);
        else joined = (joinedRows ?? []) as EventRow[];
      }
      // Mes événements : à venir d'abord (le plus proche en premier), puis les passés (le plus récent en premier)
      const all = [...organized, ...joined];
      const isPast = (e: EventRow) => new Date(e.starts_at).getTime() <= now;
      setMine([
        ...all.filter((e) => !isPast(e)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        ...all.filter(isPast).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
      ]);

      // À venir : même ville que moi d'abord, puis même pays, puis le reste
      const upcomingRows = rankByProximity(upcomingResult.data, place);
      setUpcoming(upcomingRows);

      // Nombre d'inscrits de chaque événement affiché
      setCounts(await fetchGoingCounts(supabase, [...upcomingRows, ...all].map((e) => e.id)));
      setLoad("ready");
    });
    // t et showToast ne changent pas le chargement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, attempt]);

  const sportsBySlug = useMemo(() => new Map(catalog.map((s) => [s.slug, s])), [catalog]);
  const list = tab === "upcoming" ? upcoming : mine;
  const filtered = sportFilter ? list.filter((e) => e.sport === sportFilter) : list;
  // Pastilles : seulement les sports présents dans l'onglet
  const filterSports = useMemo(() => {
    const slugs = [...new Set(list.map((e) => e.sport))];
    return slugs.map((slug) => sportsBySlug.get(slug) ?? { id: 0, slug, name: slug, emoji: "🏅", search: slug });
  }, [list, sportsBySlug]);

  function roleFor(event: EventRow): CardRole {
    if (event.organizer_id === me) return "organizer";
    return statuses.get(event.id) ?? null;
  }

  async function join(event: EventRow) {
    if (joining) return;
    const expected: ParticipantStatus = event.join_mode === "approval" ? "pending" : "going";
    const previousStatuses = statuses;
    const previousCount = counts.get(event.id) ?? 0;
    setJoining(event.id);
    // Mise à jour optimiste
    setStatuses(new Map(statuses).set(event.id, expected));
    if (expected === "going") setCounts(new Map(counts).set(event.id, previousCount + 1));
    const result = await joinEvent(createClient(), event.id, me);
    if (!result.ok) {
      setStatuses(previousStatuses);
      setCounts((current) => new Map(current).set(event.id, previousCount));
      showToast(t(result.errorKey));
    } else {
      const { status, count } = result;
      if (status) setStatuses((current) => new Map(current).set(event.id, status));
      if (count !== null) setCounts((current) => new Map(current).set(event.id, count));
      showToast(t(result.messageKey));
      // L'événement apparaît aussi dans « Mes événements »
      if (!mine.some((e) => e.id === event.id)) setMine((current) => [event, ...current]);
    }
    setJoining(null);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const problem = await deleteEvent(createClient(), toDelete.id);
    setDeleting(false);
    if (problem) {
      console.error(`Suppression impossible : ${problem}`);
      setDeleteError(t("event.deleteError"));
      return;
    }
    const id = toDelete.id;
    setMine((current) => current.filter((e) => e.id !== id));
    setUpcoming((current) => current.filter((e) => e.id !== id));
    setToDelete(null);
    showToast(t("events.deleted"));
  }

  return (
    <AppShell active="evenements">
      {/* En-tête : titre et bouton « Créer » */}
      <div className="flex items-center justify-between gap-3 px-4 pt-6">
        <h1 className="text-3xl font-black italic tracking-tight">{t("events.title")}</h1>
        <Link
          href="/evenements/creer"
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-on-accent shadow-[0_0_18px_rgba(57,255,20,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <svg {...iconProps} className="h-4 w-4" strokeWidth={3}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("events.create")}
        </Link>
      </div>

      {/* Onglets */}
      <div role="tablist" aria-label={t("events.title")} className="mx-4 mt-5 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
        {(["upcoming", "mine"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`onglet-${value}`}
            aria-selected={tab === value}
            aria-controls="liste-evenements"
            onClick={() => {
              setTab(value);
              setSportFilter(null);
            }}
            className={`min-h-10 rounded-full text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
              tab === value ? "bg-accent text-on-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {value === "upcoming" ? t("events.tabUpcoming") : t("events.tabMine")}
          </button>
        ))}
      </div>

      {/* Filtre par sport : pastilles défilantes */}
      {load === "ready" && filterSports.length > 1 && (
        <div className="mt-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul aria-label={t("events.filterLabel")} className="flex w-max gap-2 px-4">
            <li>
              <FilterChip selected={sportFilter === null} onClick={() => setSportFilter(null)} label={t("events.allSports")} />
            </li>
            {filterSports.map((sport) => (
              <li key={sport.slug}>
                <FilterChip
                  selected={sportFilter === sport.slug}
                  onClick={() => setSportFilter(sportFilter === sport.slug ? null : sport.slug)}
                  label={sport.name}
                  image={sportImage(sport.slug, sport.name)}
                  emoji={sport.emoji}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="liste-evenements" role="tabpanel" aria-labelledby={`onglet-${tab}`} className="mt-4 flex flex-col gap-3 px-4">
        {load === "loading" && [0, 1, 2].map((n) => <EventCardSkeleton key={n} />)}

        {load === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-danger">{t("events.loadError")}</p>
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

        {load === "ready" && filtered.length === 0 && (
          <EventsEmptyState
            title={tab === "mine" ? t("events.mineEmptyTitle") : t("events.emptyTitle")}
            text={tab === "mine" ? t("events.mineEmptyText") : t("events.emptyText")}
            cta={t("create.event")}
          />
        )}

        {load === "ready" &&
          filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              sport={sportsBySlug.get(event.sport)}
              goingCount={counts.get(event.id) ?? 0}
              role={roleFor(event)}
              ended={new Date(event.starts_at).getTime() <= loadedAt}
              tooYoung={age !== null && age < event.min_age}
              busy={joining === event.id}
              onJoin={() => join(event)}
              onManage={() => setManaged(event)}
            />
          ))}
      </div>

      <EventManageSheet
        eventId={managed?.id ?? null}
        title={managed?.title ?? ""}
        onDelete={() => {
          setDeleteError("");
          setToDelete(managed);
        }}
        onClose={() => setManaged(null)}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title={t("event.deleteTitle")}
        description={t("event.deleteText")}
        confirmLabel={t("event.deleteConfirm")}
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!deleting) setToDelete(null);
        }}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
      >
        {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>}
      </div>
    </AppShell>
  );
}

function FilterChip({
  selected,
  onClick,
  label,
  image,
  emoji,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  image?: string | null;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border-2 py-1 pl-1 pr-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
        image || emoji ? "" : "pl-4"
      } ${selected ? "border-accent-ink bg-accent-ink/10 text-accent-ink" : "border-line bg-surface hover:border-accent-ink"}`}
    >
      {image ? (
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
          <Image src={image} alt="" fill sizes="32px" className="object-cover" />
        </span>
      ) : emoji ? (
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-ink/60 text-base">
          {emoji}
        </span>
      ) : null}
      {label}
    </button>
  );
}
