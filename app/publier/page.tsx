"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import { EVENT_COLUMNS, fetchMyStatuses, formatEventDate, type EventRow } from "../../lib/events";
import { loadPeople, type Person } from "../../lib/follows";
import { useLanguage, useT } from "../../lib/i18n";
import {
  POST_BODY_MAX,
  POST_IMAGE_ACCEPT,
  POST_IMAGE_MAX_INPUT_BYTES,
  POST_MAX_IMAGES,
  compressPostImage,
  isAcceptedPostImage,
  postErrorKey,
  removePostImages,
  uploadPostImage,
} from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { loadMySports, useSportsCatalog, type CatalogSport } from "../../lib/userSports";

type Photo = { id: string; blob: Blob; preview: string };

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Nouvelle publication (plein écran) : texte, jusqu'à 4 photos, sport et événement facultatifs
export default function Publier() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();
  const { state: catalogState } = useSportsCatalog();

  const [me, setMe] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [mySportIds, setMySportIds] = useState<number[]>([]);
  const [myEvents, setMyEvents] = useState<EventRow[]>([]);

  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const [sport, setSport] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      const now = new Date().toISOString();
      const [people, choices, statuses, organized] = await Promise.all([
        loadPeople(supabase, [uid]).catch(() => [] as Person[]),
        loadMySports(supabase, uid).catch((err: unknown) => {
          console.error("Lecture des sports impossible :", err);
          return [];
        }),
        fetchMyStatuses(supabase, uid),
        supabase.from("events").select(EVENT_COLUMNS).eq("organizer_id", uid).eq("cancelled", false).gt("starts_at", now),
      ]);
      setMe(people[0] ?? { id: uid, username: null, displayName: null, avatarUrl: null, isPrivate: false });
      setMySportIds(choices.map((c) => c.sportId));

      // Mes événements à venir : ceux que j'organise et ceux où je suis inscrit
      const mine = (organized.data ?? []) as EventRow[];
      if (organized.error) console.error(`Lecture de mes événements impossible : ${organized.error.message}`);
      const goingIds = [...statuses].filter(([, status]) => status === "going").map(([id]) => id).filter((id) => !mine.some((e) => e.id === id));
      let joined: EventRow[] = [];
      if (goingIds.length > 0) {
        const { data: rows, error } = await supabase
          .from("events")
          .select(EVENT_COLUMNS)
          .in("id", goingIds)
          .eq("cancelled", false)
          .gt("starts_at", now);
        if (error) console.error(`Lecture de mes inscriptions impossible : ${error.message}`);
        else joined = (rows ?? []) as EventRow[];
      }
      setMyEvents([...mine, ...joined].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setReady(true);
    });
  }, [router]);

  // Libère les aperçus quand on quitte la page
  useEffect(() => {
    return () => photos.forEach((p) => URL.revokeObjectURL(p.preview));
    // Seulement au démontage : les photos retirées sont libérées dans removePhoto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sports : les miens d'abord, puis tous les autres
  const sports = useMemo(() => {
    const catalog = catalogState.status === "ready" ? catalogState.sports : [];
    const mine = mySportIds.flatMap((id) => catalog.find((s) => s.id === id) ?? []);
    return [...mine, ...catalog.filter((s) => !mySportIds.includes(s.id))];
  }, [catalogState, mySportIds]);

  const empty = body.trim().length === 0 && photos.length === 0;

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError("");
    const room = POST_MAX_IMAGES - photos.length;
    const chosen = Array.from(files);
    if (chosen.length > room) setPhotoError(t("publish.photoMax"));
    for (const file of chosen.slice(0, room)) {
      if (!isAcceptedPostImage(file) || file.size > POST_IMAGE_MAX_INPUT_BYTES) {
        setPhotoError(t("publish.photoType"));
        continue;
      }
      setPreparing((n) => n + 1);
      try {
        const blob = await compressPostImage(file);
        setPhotos((current) =>
          current.length >= POST_MAX_IMAGES ? current : [...current, { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) }]
        );
      } catch (err) {
        console.error("Préparation de la photo impossible :", err);
        setPhotoError(t("publish.photoProcess"));
      }
      setPreparing((n) => n - 1);
    }
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.preview);
    setPhotos((current) => current.filter((p) => p.id !== photo.id));
  }

  async function publish() {
    if (!me || empty || publishing || preparing > 0) return;
    setPublishing(true);
    setError("");
    const supabase = createClient();

    // 1. Photos
    const uploaded: { path: string; url: string }[] = [];
    try {
      for (const photo of photos) uploaded.push(await uploadPostImage(supabase, me.id, photo.blob));
    } catch (err) {
      console.error("Envoi des photos impossible :", err);
      await removePostImages(supabase, uploaded.map((u) => u.path));
      setError(t("post.errorGeneric"));
      setPublishing(false);
      return;
    }

    // 2. Publication
    const { error: insertError } = await supabase.from("posts").insert({
      author_id: me.id,
      body: body.trim(),
      image_urls: uploaded.map((u) => u.url),
      sport,
      event_id: eventId,
    });
    if (insertError) {
      console.error(`Publication impossible : ${insertError.message} (code ${insertError.code})`);
      // Photos déjà envoyées mais publication refusée : on ne laisse pas de fichiers orphelins
      await removePostImages(supabase, uploaded.map((u) => u.path));
      setError(t(postErrorKey(insertError)));
      setPublishing(false);
      return;
    }
    router.push("/accueil?publie=1");
  }

  if (!ready || !me) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>;
  }

  const name = me.displayName || me.username || t("event.member");
  const chip = (selected: boolean) =>
    `flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
      selected ? "border-accent-ink bg-accent-ink/10 text-accent-ink" : "border-line bg-surface hover:border-accent-ink"
    }`;

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-4 pb-10 pt-4">
        {/* En-tête : retour, titre, « Publier » */}
        <header className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-2">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/accueil"))}
            disabled={publishing}
            aria-label={t("common.back")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60"
          >
            <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-center text-lg font-bold">{t("publish.title")}</h1>
          <button
            type="button"
            onClick={publish}
            disabled={empty || publishing || preparing > 0}
            aria-busy={publishing}
            className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {publishing ? t("publish.publishing") : t("create.post")}
          </button>
        </header>

        {/* Auteur et texte */}
        <div className="mt-6 flex gap-3">
          <Avatar src={me.avatarUrl} initial={initialsOf(name)} alt="" size={44} neon />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">{name}</p>
            <label htmlFor="texte" className="sr-only">
              {t("feed.whatsNew")}
            </label>
            <textarea
              id="texte"
              rows={5}
              maxLength={POST_BODY_MAX}
              placeholder={t("feed.whatsNew")}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setError("");
              }}
              aria-describedby="texte-compte"
              className="mt-2 w-full resize-none bg-transparent text-base outline-none placeholder:text-subtle"
            />
            <p id="texte-compte" className="text-right text-xs text-muted">
              {body.length}/{POST_BODY_MAX}
            </p>
          </div>
        </div>

        {/* Photos */}
        <section aria-labelledby="titre-photos" className="mt-4">
          <h2 id="titre-photos" className="sr-only">
            {t("publish.photos")}
          </h2>
          {photos.length > 0 && (
            <ul className="mb-3 grid grid-cols-2 gap-2">
              {photos.map((photo, index) => (
                <li key={photo.id} className="relative aspect-square overflow-hidden rounded-xl bg-line">
                  <Image src={photo.preview} alt={t("publish.photoN").replace("{n}", String(index + 1))} fill unoptimized sizes="240px" className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo)}
                    disabled={publishing}
                    aria-label={t("publish.removePhoto").replace("{n}", String(index + 1))}
                    className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < POST_MAX_IMAGES && (
            <label
              className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-ink/50 text-sm font-bold text-accent-ink transition-colors hover:border-accent-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-ink ${
                publishing ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <input
                type="file"
                accept={POST_IMAGE_ACCEPT}
                multiple
                disabled={publishing}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />
              <svg {...iconProps} className="h-5 w-5" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
              {preparing > 0 ? t("eventForm.photoPreparing") : t("eventForm.addPhoto")}
              <span className="font-semibold text-muted">
                ({photos.length}/{POST_MAX_IMAGES})
              </span>
            </label>
          )}
          <p aria-live="polite" className="mt-1.5 text-xs text-danger">
            {photoError}
          </p>
        </section>

        {/* Sport (facultatif, un seul) */}
        <section aria-labelledby="titre-sport" className="mt-4">
          <h2 id="titre-sport" className="mb-2 text-sm font-bold">
            {t("publish.sport")} <span className="font-normal text-muted">{t("eventForm.photoOptional")}</span>
          </h2>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex w-max gap-2 py-0.5">
              {catalogState.status === "loading" &&
                [0, 1, 2].map((n) => <li key={n} aria-hidden="true" className="h-11 w-28 animate-pulse rounded-full bg-surface" />)}
              {sports.map((s: CatalogSport) => (
                <li key={s.slug}>
                  <button type="button" aria-pressed={sport === s.slug} onClick={() => setSport(sport === s.slug ? null : s.slug)} className={chip(sport === s.slug)}>
                    <span aria-hidden="true">{s.emoji}</span>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {catalogState.status === "error" && <p className="text-xs text-danger">{t("eventForm.sportsError")}</p>}
        </section>

        {/* Événement lié (facultatif) */}
        <section aria-labelledby="titre-evenement" className="mt-5">
          <h2 id="titre-evenement" className="mb-2 text-sm font-bold">
            {t("publish.linkEvent")} <span className="font-normal text-muted">{t("eventForm.photoOptional")}</span>
          </h2>
          {myEvents.length === 0 ? (
            <p className="text-sm text-muted">{t("publish.noEvents")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {myEvents.map((event) => {
                const selected = eventId === event.id;
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setEventId(selected ? null : event.id)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                        selected ? "border-accent-ink bg-accent-ink/10" : "border-line bg-surface hover:border-accent-ink"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{event.title}</span>
                        <span className="block truncate text-xs text-muted">{formatEventDate(event.starts_at, language)}</span>
                      </span>
                      {selected && (
                        <svg {...iconProps} className="h-5 w-5 shrink-0 text-accent-ink" strokeWidth={3}>
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p aria-live="polite" className="mt-5 min-h-5 text-sm text-danger">
          {error}
        </p>
      </div>
    </main>
  );
}
