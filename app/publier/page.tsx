"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import ImageCarousel from "../../components/ImageCarousel";
import { EVENT_COLUMNS, fetchMyStatuses, formatEventDate, type EventRow } from "../../lib/events";
import { loadPeople, type Person } from "../../lib/follows";
import { useLanguage, useT, type MessageKey } from "../../lib/i18n";
import {
  POST_BODY_MAX,
  POST_IMAGE_ACCEPT,
  POST_IMAGE_MAX_INPUT_BYTES,
  POST_MAX_IMAGES,
  compressPostImage,
  isAcceptedPostImage,
  postErrorKey,
  removePostImages,
  removeVideoFiles,
  uploadPostImage,
} from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { useSportOptions, type SportOption } from "../../lib/sportOptions";
import { loadMySports } from "../../lib/userSports";
import {
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  formatDuration,
  readVideo,
  uploadPoster,
  uploadVideo,
  videoContentType,
} from "../../lib/videos";

type Photo = { id: string; blob: Blob; preview: string };
type Video = { file: File; preview: string; duration: number; poster: Blob | null; posterPreview: string | null };

// Boutons « Ajouter une photo » / « Ajouter une vidéo » (désactivés : estompés, sans survol)
const pickerButton =
  "flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-ink/50 px-2 text-sm font-bold text-accent-ink transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-accent-ink/50";

function revokeVideo(video: Video) {
  URL.revokeObjectURL(video.preview);
  if (video.posterPreview) URL.revokeObjectURL(video.posterPreview);
}

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Nouvelle publication (plein écran) : texte, jusqu'à 4 photos OU une vidéo de 30 s, sport et événement facultatifs
export default function Publier() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();
  const { state: catalogState } = useSportOptions();

  const [me, setMe] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [mySportIds, setMySportIds] = useState<number[]>([]);
  const [myEvents, setMyEvents] = useState<EventRow[]>([]);

  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const [video, setVideo] = useState<Video | null>(null);
  const [videoPreparing, setVideoPreparing] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [progress, setProgress] = useState<number | null>(null); // envoi de la vidéo, de 0 à 1
  const videoRef = useRef<Video | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
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

  // Aperçus de la vidéo libérés au démontage (une vidéo retirée est libérée dans removeVideo)
  useEffect(() => {
    videoRef.current = video;
  }, [video]);
  useEffect(() => {
    return () => {
      if (videoRef.current) revokeVideo(videoRef.current);
    };
  }, []);

  // Envoi en cours : le navigateur demande une confirmation avant de quitter la page
  useEffect(() => {
    if (!publishing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t("publish.leaveWarning");
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [publishing, t]);

  // Sports : les miens d'abord, puis tous les autres
  const sports = useMemo(() => {
    const catalog = catalogState.status === "ready" ? catalogState.options : [];
    const mine = mySportIds.flatMap((id) => catalog.find((s) => s.id === id) ?? []);
    return [...mine, ...catalog.filter((s) => !mySportIds.includes(s.id))];
  }, [catalogState, mySportIds]);

  const empty = body.trim().length === 0 && photos.length === 0 && !video;
  const busy = publishing || preparing > 0 || videoPreparing;

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

  // Une seule vidéo : type, 50 Mo, lisible par le navigateur, 30 secondes ; l'affiche est capturée à ~0,5 s
  async function addVideo(file: File | undefined) {
    if (!file) return;
    setVideoError("");
    if (!videoContentType(file)) {
      setVideoError(t("publish.videoType"));
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      setVideoError(t("publish.videoTooBig"));
      return;
    }
    setVideoPreparing(true);
    try {
      const info = await readVideo(file);
      // Petite marge : un clip de « 30 s » filmé au téléphone dure souvent 30,0x s
      if (info.duration >= VIDEO_MAX_SECONDS + 0.5) {
        setVideoError(t("publish.videoTooLong"));
      } else {
        setVideo({
          file,
          preview: URL.createObjectURL(file),
          duration: info.duration,
          poster: info.poster,
          posterPreview: info.poster ? URL.createObjectURL(info.poster) : null,
        });
      }
    } catch (err) {
      console.error("Lecture de la vidéo impossible :", err);
      setVideoError(t("publish.videoUnreadable"));
    }
    setVideoPreparing(false);
  }

  function removeVideo() {
    if (video) revokeVideo(video);
    setVideo(null);
    setVideoError("");
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.preview);
    setPhotos((current) => current.filter((p) => p.id !== photo.id));
  }

  async function publish() {
    if (!me || empty || busy) return;
    setPublishing(true);
    setError("");
    const supabase = createClient();

    if (video) {
      await publishVideo(supabase, me.id, video);
      return;
    }

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

  // Vidéo (bucket « videos ») puis affiche (bucket « posts »), puis la publication.
  // Si quelque chose échoue, les fichiers déjà envoyés sont supprimés.
  async function publishVideo(supabase: ReturnType<typeof createClient>, userId: string, chosen: Video) {
    const id = crypto.randomUUID();
    let videoFile: { path: string; url: string } | null = null;
    let posterFile: { path: string; url: string } | null = null;
    const fail = async (key: MessageKey) => {
      await removeVideoFiles(supabase, videoFile?.path ?? null, posterFile?.path ?? null);
      setError(t(key));
      setProgress(null);
      setPublishing(false);
    };

    setProgress(0);
    try {
      videoFile = await uploadVideo(supabase, userId, id, chosen.file, setProgress);
      if (chosen.poster) posterFile = await uploadPoster(supabase, userId, id, chosen.poster);
    } catch (err) {
      console.error("Envoi de la vidéo impossible :", err);
      await fail("post.errorGeneric");
      return;
    }

    const { error: insertError } = await supabase.from("posts").insert({
      author_id: userId,
      body: body.trim(),
      image_urls: [],
      video_url: videoFile.url,
      video_poster_url: posterFile?.url ?? null,
      video_duration_s: Math.min(VIDEO_MAX_SECONDS, Math.max(1, Math.round(chosen.duration))),
      sport,
      event_id: eventId,
    });
    if (insertError) {
      console.error(`Publication impossible : ${insertError.message} (code ${insertError.code})`);
      await fail(postErrorKey(insertError));
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
            disabled={empty || busy}
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
            // Même carrousel que les publications ; « × » en haut à gauche (le compteur est en haut à droite)
            <ImageCarousel
              images={photos.map((photo) => photo.preview)}
              zoomable={false}
              className="mb-3"
              overlay={(index) => (
                <button
                  type="button"
                  onClick={() => removePhoto(photos[index])}
                  disabled={publishing}
                  aria-label={t("publish.removePhoto").replace("{n}", String(index + 1))}
                  className="absolute left-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            />
          )}
          {video && (
            <div className="relative mb-3 overflow-hidden rounded-xl bg-black">
              <video
                src={video.preview}
                poster={video.posterPreview ?? undefined}
                controls
                muted
                playsInline
                aria-label={t("publish.videoPreview")}
                className="mx-auto block max-h-[60vh] w-full object-contain"
              />
              <button
                type="button"
                onClick={removeVideo}
                disabled={publishing}
                aria-label={t("publish.removeVideo")}
                className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
              >
                <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <span className="pointer-events-none absolute left-2 top-3 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {formatDuration(video.duration)}
              </span>
            </div>
          )}

          {/* Barre de progression de l'envoi de la vidéo */}
          {progress !== null && (
            <div className="mb-3">
              <div
                role="progressbar"
                aria-label={t("publish.uploadLabel")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">{t("publish.uploading").replace("{n}", String(Math.round(progress * 100)))}</p>
            </div>
          )}

          {/* Photos et vidéo sont exclusives : choisir l'une désactive l'autre */}
          {/* Champs de fichier cachés, ouverts par les boutons ci-dessous (plus fiable qu'un <label> sur mobile) */}
          <input
            ref={photoInputRef}
            type="file"
            accept={POST_IMAGE_ACCEPT}
            multiple
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addVideo(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
          <div className="flex gap-2">
            {photos.length < POST_MAX_IMAGES && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={publishing || video !== null || videoPreparing}
                className={pickerButton}
              >
                <svg {...iconProps} className="h-5 w-5 shrink-0" strokeWidth={2}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.8" />
                  <path d="M21 16l-5-5-8 8" />
                </svg>
                {preparing > 0 ? t("eventForm.photoPreparing") : t("eventForm.addPhoto")}
                <span className="font-semibold text-muted">
                  ({photos.length}/{POST_MAX_IMAGES})
                </span>
              </button>
            )}
            {!video && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={publishing || photos.length > 0 || preparing > 0 || videoPreparing}
                className={pickerButton}
              >
                <svg {...iconProps} className="h-5 w-5 shrink-0" strokeWidth={2}>
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="M16 10.5l5-3v9l-5-3z" />
                </svg>
                {videoPreparing ? t("publish.videoPreparing") : t("publish.addVideo")}
              </button>
            )}
          </div>
          {video && <p className="mt-1.5 text-xs text-muted">{t("publish.photosLocked")}</p>}
          {photos.length > 0 && <p className="mt-1.5 text-xs text-muted">{t("publish.videoLocked")}</p>}
          <p aria-live="polite" className="mt-1.5 text-xs text-danger">
            {photoError || videoError}
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
              {/* Valeur enregistrée dans posts.sport : la même que celle des icônes de filtre de l'accueil (lib/sportOptions.ts) */}
              {sports.map((s: SportOption) => (
                <li key={s.value}>
                  <button type="button" aria-pressed={sport === s.value} onClick={() => setSport(sport === s.value ? null : s.value)} className={chip(sport === s.value)}>
                    <span aria-hidden="true">{s.emoji}</span>
                    {s.label}
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
