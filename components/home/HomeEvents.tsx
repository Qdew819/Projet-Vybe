"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import EventCard, { EventCardSkeleton } from "../EventCard";
import EventManageSheet from "../EventManageSheet";
import EventsEmptyState from "../EventsEmptyState";
import { useEventParticipation } from "../useEventParticipation";
import {
  deleteEvent,
  fetchGoingCounts,
  fetchMyPlace,
  fetchMyStatuses,
  fetchUpcomingEvents,
  participationOf,
  rankByProximity,
  type EventRow,
} from "../../lib/events";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";
import { fetchCatalog, type CatalogSport } from "../../lib/userSports";

// Combien d'événements à venir on lit pour en garder 3 (les plus proches de la personne en premier)
const FETCH_LIMIT = 30;
const SHOWN = 3;

type Load = "loading" | "error" | "ready";

// Contenu de la section « Événements près de toi » de l'accueil : vrais événements, mêmes cartes que /evenements
export default function HomeEvents({ userId, onMessage }: { userId: string; onMessage: (text: string) => void }) {
  const t = useT();
  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogSport[]>([]);
  const [age, setAge] = useState<number | null>(null);
  const [managed, setManaged] = useState<EventRow | null>(null);
  const [toDelete, setToDelete] = useState<EventRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const { statuses, setStatuses, counts, setCounts, busyId, join, askLeave, leaveDialog } = useEventParticipation({
    userId,
    onMessage,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const [upcoming, place, myStatuses, ageResult, sports] = await Promise.all([
          fetchUpcomingEvents(supabase, FETCH_LIMIT, Date.now()),
          fetchMyPlace(supabase, userId),
          fetchMyStatuses(supabase, userId),
          supabase.rpc("get_age", { uid: userId }),
          fetchCatalog(supabase).catch((err: unknown) => {
            console.error(err);
            return [] as CatalogSport[];
          }),
        ]);
        const shown = rankByProximity(upcoming, place).slice(0, SHOWN);
        const going = await fetchGoingCounts(supabase, shown.map((e) => e.id));
        if (cancelled) return;
        setEvents(shown);
        setStatuses(myStatuses);
        setCounts(going);
        setCatalog(sports);
        if (!ageResult.error && typeof ageResult.data === "number") setAge(ageResult.data);
        setLoad("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoad("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt, setCounts, setStatuses]);

  const sportsBySlug = useMemo(() => new Map(catalog.map((s) => [s.slug, s])), [catalog]);


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
    setEvents((current) => current.filter((e) => e.id !== id));
    setToDelete(null);
    onMessage(t("events.deleted"));
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {load === "loading" && (
        <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-3">
          <EventCardSkeleton />
        </div>
      )}

      {load === "error" && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-danger">
          {t("events.loadError")}
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

      {load === "ready" && events.length === 0 && (
        <EventsEmptyState title={t("events.emptyTitle")} text={t("events.emptyText")} cta={t("create.event")} />
      )}

      {load === "ready" &&
        events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            sport={sportsBySlug.get(event.sport)}
            goingCount={counts.get(event.id) ?? 0}
            participation={participationOf(event, userId, statuses.get(event.id))}
            tooYoung={age !== null && age < event.min_age}
            busy={busyId === event.id}
            onJoin={() => join(event)}
            onLeave={() => askLeave(event)}
            onManage={() => setManaged(event)}
          />
        ))}

      {leaveDialog}
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
    </div>
  );
}
