"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Avatar from "../../../components/Avatar";
import BirthDateNotice from "../../../components/BirthDateNotice";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ShareButton from "../../../components/ShareButton";
import { leaveTexts } from "../../../components/useEventParticipation";
import {
  EVENT_CAPACITY_MAX,
  EVENT_CAPACITY_MIN,
  EVENT_COLUMNS,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  combineDateTime,
  deleteEvent,
  eventActionErrorKey,
  eventSaveErrorKey,
  formatEventDate,
  isExpectedRefusal,
  leaveEvent,
  toDateInput,
  toParticipants,
  toTimeInput,
  todayInputValue,
  type EventRow,
  type Participant,
  type ParticipantStatus,
} from "../../../lib/events";
import { loadPeople, type Person } from "../../../lib/follows";
import { eventSharePath } from "../../../lib/share";
import { useLanguage, useT, type MessageKey } from "../../../lib/i18n";
import { initialsOf } from "../../../lib/profile";
import { sportImage } from "../../../lib/sportImages";
import { createClient } from "../../../lib/supabase/client";
import { LEVEL_LABEL, fetchCatalog, isLevel, type CatalogSport } from "../../../lib/userSports";

// L'identifiant n'est connu qu'au moment de la visite : useParams() a besoin d'un <Suspense>
// (seulement autour de cette page) pour que le build fonctionne.
export default function EvenementPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Evenement />
    </Suspense>
  );
}

type Load = "loading" | "notFound" | "error" | "ready";
type Confirm = { kind: "leave"; status: ParticipantStatus } | { kind: "delete" } | { kind: "remove"; person: Person } | null;

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const fieldClass =
  "w-full rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink";

function personName(person: Person | undefined, fallback: string): string {
  return person?.displayName || (person?.username ? `@${person.username}` : fallback);
}

function Evenement() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();
  const params = useParams<{ id: string }>();
  const eventId = decodeURIComponent(params.id ?? "");

  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [me, setMe] = useState("");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [sport, setSport] = useState<CatalogSport | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [organizer, setOrganizer] = useState<Person | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [goingCount, setGoingCount] = useState(0);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  // undefined : pas lue (pas le droit) ; null : aucune adresse indiquée
  const [address, setAddress] = useState<string | null | undefined>(undefined);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [editing, setEditing] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  // Heure du chargement : sert à savoir si l'événement est déjà passé
  const [loadedAt, setLoadedAt] = useState(0);
  // Inscription refusée faute de date de naissance : bandeau avec lien vers Paramètres → Compte
  const [birthDateMissing, setBirthDateMissing] = useState(false);

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string) => {
    // Espace insécable en alternance : le même message est annoncé de nouveau
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Participants, nombre d'inscrits, profils et adresse : relus après chaque action
  const refresh = useCallback(
    async (row: EventRow, myId: string) => {
      const supabase = createClient();
      const [participantsResult, countResult] = await Promise.all([
        supabase.from("event_participants").select("*").eq("event_id", row.id),
        supabase.rpc("event_going_count", { p_event: row.id }),
      ]);
      let list: Participant[] = [];
      if (participantsResult.error) {
        console.error(
          `Lecture des participants impossible : ${participantsResult.error.message} (code ${participantsResult.error.code})`
        );
      } else {
        list = toParticipants(participantsResult.data as Record<string, unknown>[]);
      }
      setParticipants(list);
      const going = list.filter((p) => p.status === "going").length;
      if (countResult.error) {
        console.error(`Lecture du nombre d'inscrits impossible : ${countResult.error.message} (code ${countResult.error.code})`);
        setGoingCount(going);
      } else {
        setGoingCount(Number(countResult.data ?? going));
      }

      const ids = [...new Set([row.organizer_id, ...list.map((p) => p.userId)])];
      try {
        const found = await loadPeople(supabase, ids);
        setPeople(new Map(found.map((person) => [person.id, person])));
        setOrganizer(found.find((person) => person.id === row.organizer_id) ?? null);
      } catch (err) {
        console.error("Lecture des profils impossible :", err);
      }

      // Adresse exacte : seulement pour l'organisateur et les inscrits confirmés
      const mine = list.find((p) => p.userId === myId)?.status;
      if (row.organizer_id === myId || mine === "going") {
        const { data, error } = await supabase.from("event_locations").select("address").eq("event_id", row.id).maybeSingle();
        if (error) {
          console.error(`Lecture de l'adresse impossible : ${error.message} (code ${error.code})`);
          setAddress(undefined);
        } else {
          setAddress(typeof data?.address === "string" && data.address.trim() ? data.address : null);
        }
      } else {
        setAddress(undefined);
      }
    },
    []
  );

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setMe(uid);

      const [eventResult, ageResult] = await Promise.all([
        supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
        supabase.rpc("get_age", { uid }),
      ]);
      // Identifiant mal formé (22P02) ou événement caché par les règles d'accès : introuvable
      if (eventResult.error && eventResult.error.code !== "22P02") {
        console.error(`Lecture de l'événement impossible : ${eventResult.error.message} (code ${eventResult.error.code})`);
        setLoad("error");
        return;
      }
      const row = eventResult.data as EventRow | null;
      if (!row) {
        setLoad("notFound");
        return;
      }
      setEvent(row);
      setLoadedAt(Date.now());
      if (ageResult.error) {
        console.error(`Calcul de l'âge impossible : ${ageResult.error.message} (code ${ageResult.error.code})`);
      } else if (typeof ageResult.data === "number") {
        setAge(ageResult.data);
      }
      try {
        const catalog = await fetchCatalog(supabase);
        setSport(catalog.find((s) => s.slug === row.sport) ?? null);
      } catch (err) {
        console.error(err);
      }
      await refresh(row, uid);
      setLoad("ready");

      // ?cree= : arrivée depuis la page de création (message)
      // ?modifier=1 : arrivée depuis « Gérer » → « Modifier » d'une carte (formulaire ouvert)
      const query = new URLSearchParams(window.location.search);
      const created = query.get("cree");
      if (created) {
        showToast(created === "sans-adresse" ? t("eventForm.createdNoAddress") : t("eventForm.created"));
      }
      if (query.get("modifier") === "1" && row.organizer_id === uid && !row.cancelled) {
        setEditing(true);
        // Après l'affichage du formulaire : on défile jusqu'à lui et on place le curseur dans le premier champ
        requestAnimationFrame(() => {
          document.getElementById("titre-gerer")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("modif-titre")?.focus({ preventScroll: true });
        });
      }
      if (created || query.has("modifier")) {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    });
    // t et showToast ne changent pas le chargement : on ne recharge pas quand la langue change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, eventId, refresh, attempt]);

  const myStatus: ParticipantStatus | null = participants.find((p) => p.userId === me)?.status ?? null;
  const isOrganizer = !!event && event.organizer_id === me;
  const ended = !!event && loadedAt > 0 && new Date(event.starts_at).getTime() <= loadedAt;
  const full = !!event && event.capacity !== null && goingCount >= event.capacity;
  const tooYoung = !!event && age !== null && age < event.min_age;

  const going = useMemo(
    () => participants.filter((p) => p.status === "going"),
    [participants]
  );
  const pending = useMemo(() => participants.filter((p) => p.status === "pending"), [participants]);
  const waitlist = useMemo(() => participants.filter((p) => p.status === "waitlist"), [participants]);

  // ---------- Actions de la personne qui visite ----------

  async function join() {
    // L'organisateur n'a pas de bouton d'inscription
    if (!event || busy || isOrganizer) return;
    const previous = participants;
    const expected: ParticipantStatus = event.join_mode === "approval" ? "pending" : full ? "waitlist" : "going";
    setBusy(true);
    // Mise à jour optimiste
    setParticipants([...participants.filter((p) => p.userId !== me), { userId: me, status: expected }]);
    if (expected === "going") setGoingCount((n) => n + 1);
    const { error } = await createClient().rpc("join_event", { p_event: event.id });
    if (error) {
      const key = eventActionErrorKey(error);
      // Refus prévus (date de naissance manquante…) : annoncés, pas envoyés en console.error
      if (!isExpectedRefusal(key)) console.error(`Inscription impossible : ${error.message} (code ${error.code})`);
      setParticipants(previous);
      if (expected === "going") setGoingCount((n) => Math.max(0, n - 1));
      if (key === "event.errorBirthDate") setBirthDateMissing(true);
      else showToast(t(key));
    } else {
      await refresh(event, me);
      showToast(t(expected === "pending" ? "event.requested" : expected === "waitlist" ? "event.waitlisted" : "event.joined"));
    }
    setBusy(false);
  }

  async function leave() {
    if (!event) return;
    // L'organisateur ne peut pas quitter son propre événement : leaveEvent ne l'envoie même pas à la base
    const wasStatus = myStatus;
    const previous = participants;
    setConfirmBusy(true);
    setBusy(true);
    setParticipants(participants.filter((p) => p.userId !== me));
    if (wasStatus === "going") setGoingCount((n) => Math.max(0, n - 1));
    const result = await leaveEvent(createClient(), event, me);
    setConfirmBusy(false);
    if (!result.ok) {
      setParticipants(previous);
      if (wasStatus === "going") setGoingCount((n) => n + 1);
      if (result.errorKey === "leave.organizerError") {
        setConfirm(null);
        showToast(t(result.errorKey));
      } else {
        setConfirmError(t(result.errorKey));
      }
      setBusy(false);
      return;
    }
    setConfirm(null);
    await refresh(event, me);
    showToast(t(wasStatus === "pending" ? "event.requestCancelled" : "event.left"));
    setBusy(false);
  }

  // ---------- Actions de l'organisateur ----------

  async function respond(person: Person, accept: boolean) {
    if (!event || busy) return;
    setBusy(true);
    const { error } = await createClient().rpc("respond_to_join", { p_event: event.id, p_user: person.id, p_accept: accept });
    if (error) {
      console.error(`Réponse à la demande impossible : ${error.message} (code ${error.code})`);
      showToast(t(eventActionErrorKey(error)));
    } else {
      await refresh(event, me);
      showToast(t(accept ? "event.accepted" : "event.refused"));
    }
    setBusy(false);
  }

  async function removeParticipant(person: Person) {
    if (!event) return;
    setConfirmBusy(true);
    const { error } = await createClient().rpc("remove_participant", { p_event: event.id, p_user: person.id });
    setConfirmBusy(false);
    if (error) {
      console.error(`Retrait du participant impossible : ${error.message} (code ${error.code})`);
      setConfirmError(t(eventActionErrorKey(error)));
      return;
    }
    setConfirm(null);
    await refresh(event, me);
    showToast(t("event.removed"));
  }

  // Suppression définitive : plus personne ne voit l'événement
  async function removeEvent() {
    if (!event) return;
    setConfirmBusy(true);
    const problem = await deleteEvent(createClient(), event.id);
    if (problem) {
      console.error(`Suppression impossible : ${problem}`);
      setConfirmBusy(false);
      setConfirmError(t("event.deleteError"));
      return;
    }
    router.push("/evenements?supprime=1");
  }

  // ---------- Affichage ----------

  if (load === "loading") return <Skeleton />;

  if (load === "notFound" || load === "error" || !event) {
    return (
      <main className="bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col items-center justify-center gap-4 px-6 text-center">
          <span aria-hidden="true" className="text-5xl">
            🏟️
          </span>
          <h1 className="text-xl font-bold">{load === "error" ? t("event.loadError") : t("event.notFound")}</h1>
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
            <Link href="/evenements" className="rounded-2xl border border-accent-ink px-6 py-3 font-bold text-accent-ink">
              {t("event.backToEvents")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const coverSrc = !coverFailed && event.cover_url ? event.cover_url : sportImage(event.sport, sport?.name ?? "");
  const unknown = t("event.member");
  const placeLine = [event.venue_name, event.city].filter(Boolean).join(" · ");
  const countLabel =
    event.capacity !== null
      ? t("event.participantsCap").replace("{n}", String(goingCount)).replace("{max}", String(event.capacity))
      : goingCount === 1
        ? t("event.participants1")
        : t("event.participantsN").replace("{n}", String(goingCount));
  const spotsLeft = event.capacity !== null ? Math.max(0, event.capacity - goingCount) : null;
  const spotsLabel =
    spotsLeft === null
      ? t("event.unlimitedSpots")
      : spotsLeft === 0
        ? t("event.noSpots")
        : spotsLeft === 1
          ? t("event.spotsLeft1")
          : t("event.spotsLeftN").replace("{n}", String(spotsLeft));

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {/* Grande couverture */}
        <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,#020702,#0b3d12)]">
          {coverSrc ? (
            <Image
              src={coverSrc}
              alt=""
              fill
              priority
              sizes="(max-width: 500px) 100vw, 500px"
              unoptimized={coverSrc.startsWith("http")}
              onError={() => setCoverFailed(true)}
              className="object-cover"
            />
          ) : (
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-7xl">
              {sport?.emoji ?? "🏅"}
            </span>
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/60 to-transparent" />
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/evenements"))}
            aria-label={t("common.back")}
            className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {/* « Envoyer » : lien court /e/<id>. Pour un événement « abonnés seulement », le lien n'affiche qu'un aperçu générique */}
          <div className="absolute right-3 top-3">
            <ShareButton
              url={eventSharePath(event.id)}
              title={event.title}
              text={
                event.city
                  ? t("share.eventText")
                      .replace("{title}", event.title)
                      .replace("{date}", formatEventDate(event.starts_at, language))
                      .replace("{city}", event.city)
                  : t("share.eventTextNoCity").replace("{title}", event.title).replace("{date}", formatEventDate(event.starts_at, language))
              }
              className="flex min-h-11 items-center gap-2 rounded-full bg-black/55 px-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
          </div>
        </div>

        <div className="px-4">
          {(event.cancelled || ended) && (
            <p role="status" className="mt-4 rounded-xl border border-danger/60 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
              {event.cancelled ? t("event.cancelledBanner") : t("event.endedBanner")}
            </p>
          )}

          {/* Titre et pastilles */}
          <h1 className="mt-4 text-2xl font-black leading-tight tracking-tight">{event.title}</h1>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <Tag>
              <span aria-hidden="true">{sport?.emoji ?? "🏅"}</span> {sport?.name ?? event.sport}
            </Tag>
            <Tag>{isLevel(event.level) ? t(LEVEL_LABEL[event.level]) : t("eventForm.allLevels")}</Tag>
            <Tag>{event.min_age >= 18 ? t("eventForm.age18") : t("eventForm.age16")}</Tag>
            {event.join_mode === "approval" && <Tag>{t("event.approvalBadge")}</Tag>}
            {event.visibility === "followers" && <Tag>{t("event.followersBadge")}</Tag>}
          </ul>

          {/* Infos */}
          <ul className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <InfoRow icon={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>}>
              <span className="font-semibold">{formatEventDate(event.starts_at, language)}</span>
            </InfoRow>
            <InfoRow icon={<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>}>
              <span className="font-semibold">{placeLine}</span>
              {address !== undefined ? (
                <span className="block text-muted">{address ?? t("event.noAddress")}</span>
              ) : (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <svg {...iconProps} className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  {t("event.addressLocked")}
                </span>
              )}
            </InfoRow>
            <InfoRow icon={<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>}>
              <span className="font-semibold">{countLabel}</span>
              <span className="block text-muted">{spotsLabel}</span>
            </InfoRow>
          </ul>

          {/* Organisateur */}
          <section aria-labelledby="titre-organisateur" className="mt-6">
            <h2 id="titre-organisateur" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("event.organizedBy")}
            </h2>
            <PersonLine person={organizer ?? undefined} fallback={unknown} />
            {isOrganizer && <p className="mt-2 text-xs font-bold text-accent-ink">{t("event.youOrganize")}</p>}
          </section>

          {event.description && (
            <section aria-labelledby="titre-description" className="mt-6">
              <h2 id="titre-description" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                {t("eventForm.description")}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p>
            </section>
          )}

          {/* Participants confirmés */}
          <section aria-labelledby="titre-participants" className="mt-6">
            <h2 id="titre-participants" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {t("event.participantsTitle")} ({going.length})
            </h2>
            {going.length === 0 ? (
              <p className="text-sm text-muted">{t("event.noParticipants")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {going.map((p) => {
                  const person = people.get(p.userId);
                  return (
                    <li key={p.userId} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <PersonLine person={person} fallback={unknown} />
                      </div>
                      {isOrganizer && person && person.id !== me && !event.cancelled && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmError("");
                            setConfirm({ kind: "remove", person });
                          }}
                          aria-label={t("event.removePerson").replace("{name}", personName(person, unknown))}
                          className="min-h-11 shrink-0 rounded-full border border-line px-4 text-xs font-bold text-muted transition-colors hover:border-danger hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                        >
                          {t("event.remove")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Gérer (organisateur) */}
          {isOrganizer && (
            <section aria-labelledby="titre-gerer" className="mt-8 rounded-2xl border-2 border-accent-ink/40 p-4">
              <h2 id="titre-gerer" className="text-lg font-black">
                {t("event.manage")}
              </h2>

              <h3 className="mb-2 mt-4 text-sm font-bold">
                {t("event.requests")} ({pending.length})
              </h3>
              {pending.length === 0 ? (
                <p className="text-sm text-muted">{t("event.noRequests")}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {pending.map((p) => {
                    const person = people.get(p.userId) ?? { id: p.userId, username: null, displayName: null, avatarUrl: null, isPrivate: false };
                    const label = personName(person, unknown);
                    return (
                      <li key={p.userId} className="flex flex-col gap-2">
                        <PersonLine person={person} fallback={unknown} />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => respond(person, true)}
                            aria-label={t("event.acceptPerson").replace("{name}", label)}
                            className="min-h-11 rounded-full bg-accent text-sm font-bold text-on-accent disabled:opacity-60"
                          >
                            {t("event.accept")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => respond(person, false)}
                            aria-label={t("event.refusePerson").replace("{name}", label)}
                            className="min-h-11 rounded-full border border-line text-sm font-bold text-muted transition-colors hover:text-foreground disabled:opacity-60"
                          >
                            {t("event.refuse")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {waitlist.length > 0 && (
                <>
                  <h3 className="mb-2 mt-5 text-sm font-bold">
                    {t("event.waitlistTitle")} ({waitlist.length})
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {waitlist.map((p) => (
                      <li key={p.userId}>
                        <PersonLine person={people.get(p.userId)} fallback={unknown} />
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-6 flex flex-col gap-3">
                {event.cancelled ? null : editing ? (
                  <EditForm
                    event={event}
                    goingCount={goingCount}
                    onCancel={() => setEditing(false)}
                    onSaved={(updated) => {
                      setEvent(updated);
                      setEditing(false);
                      showToast(t("event.saved"));
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="min-h-12 rounded-2xl border border-accent-ink font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                  >
                    {t("event.edit")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmError("");
                    setConfirm({ kind: "delete" });
                  }}
                  className="min-h-12 rounded-2xl border border-danger font-bold text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                >
                  {t("event.delete")}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Bouton principal, fixé en bas. L'organisateur n'a ni « S'inscrire » ni « Quitter » : un simple rappel */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto w-full max-w-[500px] border-t border-line bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <MainAction
            organizer={isOrganizer}
            status={myStatus}
            cancelled={event.cancelled}
            ended={ended}
            full={full}
            tooYoung={tooYoung}
            minAge={event.min_age}
            approval={event.join_mode === "approval"}
            busy={busy}
            onJoin={join}
            onLeave={() => {
              setConfirmError("");
              if (isOrganizer) showToast(t("leave.organizerError"));
              else if (myStatus) setConfirm({ kind: "leave", status: myStatus });
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "remove"
            ? t("event.removeTitle").replace("{name}", personName(confirm.person, unknown))
            : confirm?.kind === "delete"
              ? t("event.deleteTitle")
              : confirm?.kind === "leave"
                ? t(leaveTexts(confirm.status).title)
                : ""
        }
        description={
          confirm?.kind === "remove"
            ? t("event.removeText")
            : confirm?.kind === "delete"
              ? t("event.deleteText")
              : confirm?.kind === "leave"
                ? t(leaveTexts(confirm.status).text).replace("{title}", event.title)
                : undefined
        }
        confirmLabel={
          confirm?.kind === "remove"
            ? t("event.remove")
            : confirm?.kind === "delete"
              ? t("event.deleteConfirm")
              : confirm?.kind === "leave"
                ? t(leaveTexts(confirm.status).confirm)
                : ""
        }
        cancelLabel={confirm?.kind === "leave" ? t(leaveTexts(confirm.status).stay) : undefined}
        danger
        busy={confirmBusy}
        error={confirmError}
        onConfirm={() => {
          if (confirm?.kind === "remove") void removeParticipant(confirm.person);
          else if (confirm?.kind === "delete") void removeEvent();
          else void leave();
        }}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />

      {birthDateMissing && <BirthDateNotice onClose={() => setBirthDateMissing(false)} />}

      {/* Messages (aria-live), au-dessus du bouton du bas */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
      >
        {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-lg">{toast}</p>}
      </div>
    </main>
  );
}

// ---------- Morceaux ----------

function MainAction({
  organizer,
  status,
  cancelled,
  ended,
  full,
  tooYoung,
  minAge,
  approval,
  busy,
  onJoin,
  onLeave,
}: {
  organizer: boolean;
  status: ParticipantStatus | null;
  cancelled: boolean;
  ended: boolean;
  full: boolean;
  tooYoung: boolean;
  minAge: number;
  approval: boolean;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const t = useT();
  const base = "w-full min-h-14 rounded-2xl text-base font-bold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60";
  const disabledButton = (label: string) => (
    <button type="button" disabled className={`${base} border border-line bg-surface text-muted`}>
      {label}
    </button>
  );

  if (organizer) {
    return (
      <p className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-accent-ink text-base font-bold text-accent-ink">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
        </svg>
        {t("event.youOrganize")}
      </p>
    );
  }
  if (cancelled) return disabledButton(t("event.cancelled"));
  if (ended) return disabledButton(t("event.ended"));

  if (status) {
    const info: Record<ParticipantStatus, MessageKey> = {
      going: "event.statusGoing",
      pending: "event.statusPending",
      waitlist: "event.statusWaitlist",
    };
    const action: Record<ParticipantStatus, MessageKey> = {
      going: "event.leave",
      pending: "event.cancelRequest",
      waitlist: "event.leaveWaitlist",
    };
    return (
      <div className="flex flex-col gap-2">
        <p className={`text-center text-sm font-bold ${status === "going" ? "text-accent-ink" : "text-muted"}`}>{t(info[status])}</p>
        <button type="button" onClick={onLeave} disabled={busy} className={`${base} border border-line text-foreground hover:border-danger hover:text-danger`}>
          {t(action[status])}
        </button>
      </div>
    );
  }

  if (tooYoung) return disabledButton(minAge >= 18 ? t("eventForm.age18") : t("eventForm.age16"));
  if (full && !approval) return disabledButton(t("event.full"));

  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={busy}
      aria-busy={busy}
      className={`${base} bg-accent text-on-accent shadow-[0_0_22px_rgba(57,255,20,0.35)]`}
    >
      {busy ? t("common.wait") : approval ? t("event.request") : t("event.join")}
    </button>
  );
}

function EditForm({
  event,
  goingCount,
  onCancel,
  onSaved,
}: {
  event: EventRow;
  goingCount: number;
  onCancel: () => void;
  onSaved: (event: EventRow) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [unlimited, setUnlimited] = useState(event.capacity === null);
  const [capacity, setCapacity] = useState(String(event.capacity ?? Math.max(EVENT_CAPACITY_MIN, goingCount)));
  const [date, setDate] = useState(toDateInput(event.starts_at));
  const [time, setTime] = useState(toTimeInput(event.starts_at));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (cleanTitle.length < EVENT_TITLE_MIN || cleanTitle.length > EVENT_TITLE_MAX) {
      setError(t("eventForm.errorName"));
      return;
    }
    const startsAt = combineDateTime(date, time);
    if (!startsAt) {
      setError(t("eventForm.errorDate"));
      return;
    }
    if (startsAt.getTime() <= Date.now()) {
      setError(t("eventForm.errorPast"));
      return;
    }
    const cap = unlimited ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < EVENT_CAPACITY_MIN || cap > EVENT_CAPACITY_MAX)) {
      setError(t("eventForm.errorCapacity"));
      return;
    }
    setSaving(true);
    setError("");
    const changes = {
      title: cleanTitle,
      description: description.trim() || null,
      capacity: cap,
      starts_at: startsAt.toISOString(),
    };
    const { error: saveError } = await createClient().from("events").update(changes).eq("id", event.id);
    setSaving(false);
    if (saveError) {
      console.error(`Modification impossible : ${saveError.message} (code ${saveError.code})`);
      setError(t(eventSaveErrorKey(saveError)));
      return;
    }
    onSaved({ ...event, ...changes });
  }

  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <div>
        <label htmlFor="modif-titre" className="mb-1.5 block text-sm font-bold">
          {t("eventForm.name")}
        </label>
        <input id="modif-titre" type="text" maxLength={EVENT_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="modif-date" className="mb-1.5 block text-sm font-bold">
            {t("eventForm.date")}
          </label>
          <input id="modif-date" type="date" min={todayInputValue()} value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} px-3 text-sm`} />
        </div>
        <div>
          <label htmlFor="modif-heure" className="mb-1.5 block text-sm font-bold">
            {t("eventForm.time")}
          </label>
          <input id="modif-heure" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={`${fieldClass} px-3 text-sm`} />
        </div>
      </div>
      <div>
        <label htmlFor="modif-places" className="mb-1.5 block text-sm font-bold">
          {t("eventForm.participants")}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="modif-places"
            type="number"
            inputMode="numeric"
            min={EVENT_CAPACITY_MIN}
            max={EVENT_CAPACITY_MAX}
            disabled={unlimited}
            value={unlimited ? "" : capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={`${fieldClass} w-28 disabled:opacity-50`}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-5 w-5 accent-accent-ink" />
            {t("eventForm.unlimited")}
          </label>
        </div>
      </div>
      <div>
        <label htmlFor="modif-description" className="mb-1.5 block text-sm font-bold">
          {t("eventForm.description")}
        </label>
        <textarea
          id="modif-description"
          rows={4}
          maxLength={EVENT_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${fieldClass} resize-none text-sm`}
        />
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-danger">
        {error}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-12 rounded-2xl border border-line font-bold text-muted disabled:opacity-60">
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={saving} aria-busy={saving} className="min-h-12 rounded-2xl bg-accent font-bold text-on-accent disabled:opacity-60">
          {saving ? t("common.saving") : t("event.editSave")}
        </button>
      </div>
    </form>
  );
}

function PersonLine({ person, fallback }: { person?: Person; fallback: string }) {
  const name = person?.displayName || person?.username || fallback;
  const content = (
    <>
      <Avatar src={person?.avatarUrl ?? null} initial={initialsOf(name)} alt="" size={40} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{name}</span>
        {person?.username && <span className="block truncate text-xs text-muted">@{person.username}</span>}
      </span>
    </>
  );
  if (!person?.username) return <div className="flex min-h-11 items-center gap-3">{content}</div>;
  return (
    <Link
      href={`/u/${encodeURIComponent(person.username)}`}
      className="flex min-h-11 items-center gap-3 rounded-xl transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      {content}
    </Link>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5">{children}</li>;
}

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg {...iconProps} className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" strokeWidth={2.1}>
        {icon}
      </svg>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

// Squelette pendant le chargement (même mise en page que la page)
function Skeleton() {
  const t = useT();
  return (
    <main className="bg-background text-foreground">
      <div role="status" aria-label={t("common.loading")} className="mx-auto w-full max-w-[500px]">
        <div className="aspect-video w-full animate-pulse bg-surface" />
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="h-7 w-3/4 animate-pulse rounded-lg bg-surface" />
          <div className="flex gap-2">
            <div className="h-7 w-24 animate-pulse rounded-full bg-surface" />
            <div className="h-7 w-20 animate-pulse rounded-full bg-surface" />
          </div>
          <div className="mt-2 h-32 animate-pulse rounded-2xl bg-surface" />
          <div className="h-12 w-1/2 animate-pulse rounded-xl bg-surface" />
        </div>
      </div>
    </main>
  );
}
