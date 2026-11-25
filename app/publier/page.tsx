"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import MediaCarousel from "../../components/MediaCarousel";
import SoundSection, { DEFAULT_SOUND, type SoundChoice } from "../../components/music/SoundSection";
import { EVENT_COLUMNS, fetchMyStatuses, formatEventDate, type EventRow } from "../../lib/events";
import { loadPeople, type Person } from "../../lib/follows";
import { useLanguage, useT } from "../../lib/i18n";
import {
  MAX_POST_MEDIA,
  MAX_POST_VIDEOS,
  POST_BODY_MAX,
  POST_IMAGE_ACCEPT,
  POST_IMAGE_MAX_INPUT_BYTES,
  compressPostImage,
  isAcceptedPostImage,
  postErrorKey,
  type MediaItem,
} from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { useSportOptions, type SportOption } from "../../lib/sportOptions";
import { reportEpidemicUsage } from "../../lib/music";
import { MUSIC_CLIP_SECONDS } from "../../lib/sound";
import { loadMySports } from "../../lib/userSports";
import {
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  legacyColumns,
  readVideo,
  removeMediaFiles,
  uploadPostMedia,
  videoContentType,
} from "../../lib/videos";

// Éléments choisis, dans l'ordre (photos déjà compressées, vidéos avec leur affiche capturée)
type Draft =
  | { id: string; kind: "image"; blob: Blob; preview: string }
  | { id: string; kind: "video"; file: File; preview: string; duration: number; poster: Blob | null; posterPreview: string | null };

// Boutons « Ajouter une photo » / « Ajouter une vidéo » (désactivés : estompés, sans survol)
const pickerButton =
  "flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-ink/50 px-2 text-sm font-bold text-accent-ink transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-accent-ink/50";

function revokeDraft(draft: Draft) {
  URL.revokeObjectURL(draft.preview);
  if (draft.kind === "video" && draft.posterPreview) URL.revokeObjectURL(draft.posterPreview);
}

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Nouvelle publication (plein écran) : texte, jusqu'à 15 photos et vidéos mélangées (dont 5 vidéos de 30 s au plus),
// dans l'ordre choisi, sport et événement facultatifs
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
  const [items, setItems] = useState<Draft[]>([]);
  const itemsRef = useRef<Draft[]>([]);
  const [preparing, setPreparing] = useState(0); // photos en préparation
  const [videoPreparing, setVideoPreparing] = useState(0); // vidéos en préparation
  const [mediaError, setMediaError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [soundChoice, setSoundChoice] = useState<SoundChoice>(DEFAULT_SOUND);
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

  // Aperçus libérés quand on quitte la page (un élément retiré est libéré dans removeItem)
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => itemsRef.current.forEach(revokeDraft);
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

  const videoCount = items.filter((item) => item.kind === "video").length;
  const empty = body.trim().length === 0 && items.length === 0;
  const busy = publishing || preparing > 0 || videoPreparing > 0;
  const mediaFull = items.length + preparing + videoPreparing >= MAX_POST_MEDIA;
  const videosFull = mediaFull || videoCount + videoPreparing >= MAX_POST_VIDEOS;

  // Place encore libre au moment d'ajouter (éléments déjà là + en préparation)
  function hasRoom(kind: Draft["kind"]): boolean {
    const current = itemsRef.current;
    if (current.length >= MAX_POST_MEDIA) return false;
    return kind === "image" || current.filter((item) => item.kind === "video").length < MAX_POST_VIDEOS;
  }

  function append(draft: Draft) {
    itemsRef.current = [...itemsRef.current, draft];
    setItems(itemsRef.current);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setMediaError("");
    // Plus que la place restante : on garde les premières choisies
    const room = MAX_POST_MEDIA - items.length - preparing - videoPreparing;
    const chosen = Array.from(files);
    if (chosen.length > room) setMediaError(t("publish.mediaMax").replace("{n}", String(MAX_POST_MEDIA)));
    for (const file of chosen.slice(0, Math.max(0, room))) {
      if (!isAcceptedPostImage(file) || file.size > POST_IMAGE_MAX_INPUT_BYTES) {
        setMediaError(t("publish.photoType"));
        continue;
      }
      setPreparing((n) => n + 1);
      try {
        const blob = await compressPostImage(file);
        if (hasRoom("image")) append({ id: crypto.randomUUID(), kind: "image", blob, preview: URL.createObjectURL(blob) });
      } catch (err) {
        console.error("Préparation de la photo impossible :", err);
        setMediaError(t("publish.photoProcess"));
      }
      setPreparing((n) => n - 1);
    }
  }

  // Chaque vidéo : type, 50 Mo, lisible par le navigateur, 30 secondes ; l'affiche est capturée à ~0,5 s
  async function addVideos(files: FileList | null) {
    if (!files) return;
    setMediaError("");
    const roomAll = MAX_POST_MEDIA - items.length - preparing - videoPreparing;
    const roomVideos = MAX_POST_VIDEOS - videoCount - videoPreparing;
    const room = Math.max(0, Math.min(roomAll, roomVideos));
    const chosen = Array.from(files);
    if (chosen.length > room) {
      setMediaError(
        roomVideos <= roomAll
          ? t("publish.videoMax").replace("{n}", String(MAX_POST_VIDEOS))
          : t("publish.mediaMax").replace("{n}", String(MAX_POST_MEDIA))
      );
    }
    for (const file of chosen.slice(0, room)) {
      if (!videoContentType(file)) {
        setMediaError(t("publish.videoType"));
        continue;
      }
      if (file.size > VIDEO_MAX_BYTES) {
        setMediaError(t("publish.videoTooBig"));
        continue;
      }
      setVideoPreparing((n) => n + 1);
      try {
        const info = await readVideo(file);
        // Petite marge : un clip de « 30 s » filmé au téléphone dure souvent 30,0x s
        if (info.duration >= VIDEO_MAX_SECONDS + 0.5) {
          setMediaError(t("publish.videoTooLong"));
        } else if (hasRoom("video")) {
          append({
            id: crypto.randomUUID(),
            kind: "video",
            file,
            preview: URL.createObjectURL(file),
            duration: info.duration,
            poster: info.poster,
            posterPreview: info.poster ? URL.createObjectURL(info.poster) : null,
          });
        }
      } catch (err) {
        console.error("Lecture de la vidéo impossible :", err);
        setMediaError(t("publish.videoUnreadable"));
      }
      setVideoPreparing((n) => n - 1);
    }
  }

  function removeItem(draft: Draft) {
    revokeDraft(draft);
    itemsRef.current = itemsRef.current.filter((item) => item.id !== draft.id);
    setItems(itemsRef.current);
    setMediaError("");
  }

  async function publish() {
    if (!me || empty || busy) return;
    setPublishing(true);
    setError("");
    const supabase = createClient();
    const fail = (message: string) => {
      setError(message);
      setUploadProgress(null);
      setPublishing(false);
    };

    // 1. Photos et vidéos : 3 à la fois, dans l'ordre choisi. Un seul échec → tout est retiré, rien n'est publié
    let media: MediaItem[] = [];
    if (items.length > 0) {
      const total = items.length;
      setUploadProgress({ done: 0, total });
      try {
        media = await uploadPostMedia(
          supabase,
          me.id,
          items.map((item) =>
            item.kind === "image"
              ? { kind: "image" as const, blob: item.blob }
              : { kind: "video" as const, file: item.file, duration: item.duration, poster: item.poster }
          ),
          (done) => setUploadProgress({ done, total })
        );
      } catch (err) {
        console.error("Envoi des photos et vidéos impossible :", err);
        fail(t("publish.photoUploadError"));
        return;
      }
    }

    // 2. Publication : posts.media + anciennes colonnes (photos, première vidéo) pour rester compatible, et le son
    const { track } = soundChoice;
    const maxStart = Math.max(0, Math.floor((track?.duration_s ?? 0) - MUSIC_CLIP_SECONDS));
    const hasVideo = media.some((m) => m.type === "video");
    const { data: created, error: insertError } = await supabase.from("posts").insert({
      author_id: me.id,
      body: body.trim(),
      media,
      ...legacyColumns(media),
      // Musique : 'vybe' → music_track_id ; 'epidemic' → music_external_id (seul l'identifiant est gardé)
      ...(track ? { music_provider: track.provider } : {}),
      music_track_id: track?.provider === "vybe" ? track.id : null,
      music_external_id: track?.provider === "epidemic" ? track.id : null,
      music_start_s: track ? Math.min(Math.round(soundChoice.musicStart), maxStart) : 0,
      music_volume: track ? soundChoice.musicVolume : 1,
      original_sound: hasVideo ? soundChoice.originalSound : true,
      original_volume: hasVideo ? soundChoice.originalVolume : 1,
      sport,
      event_id: eventId,
    }).select("id").single();
    if (insertError) {
      console.error(`Publication impossible : ${insertError.message} (code ${insertError.code})`);
      // Fichiers déjà envoyés mais publication refusée : on ne laisse pas de fichiers orphelins
      await removeMediaFiles(supabase, media);
      fail(t(postErrorKey(insertError)));
      return;
    }
    // Epidemic Sound : la publication compte comme un « export » à signaler (côté serveur, sans attendre)
    if (track?.provider === "epidemic" && created?.id) reportEpidemicUsage(String(created.id));
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

        {/* Photos et vidéos */}
        <section aria-labelledby="titre-photos" className="mt-4">
          <h2 id="titre-photos" className="sr-only">
            {t("publish.photos")}
          </h2>
          {items.length > 0 && (
            // Même carrousel que les publications, dans l'ordre choisi ; « × » en haut à gauche de chaque élément
            <MediaCarousel
              items={items.map((item) =>
                item.kind === "image"
                  ? { type: "image", url: item.preview }
                  : { type: "video", url: item.preview, poster: item.posterPreview, duration_s: item.duration }
              )}
              preview
              zoomable={false}
              className="mb-2"
              overlay={(index) => {
                const item = items[index];
                if (!item) return null;
                return (
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    disabled={publishing}
                    aria-label={item.kind === "video" ? t("publish.removeVideo") : t("publish.removePhoto").replace("{n}", String(index + 1))}
                    className="absolute left-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                );
              }}
            />
          )}
          <p className="mb-3 text-right text-xs font-semibold tabular-nums text-muted">
            {t("publish.mediaCount")
              .replace("{n}", String(items.length))
              .replace("{max}", String(MAX_POST_MEDIA))
              .replace("{v}", String(videoCount))
              .replace("{vmax}", String(MAX_POST_VIDEOS))}
          </p>

          {/* Progression de l'envoi : « Envoi 3/8… » */}
          {uploadProgress && (
            <div className="mb-3">
              <div
                role="progressbar"
                aria-label={t("publish.uploadLabel")}
                aria-valuemin={0}
                aria-valuemax={uploadProgress.total}
                aria-valuenow={uploadProgress.done}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                />
              </div>
              <p aria-live="polite" className="mt-1 text-xs font-semibold text-muted">
                {t("publish.uploadingPhotos")
                  .replace("{n}", String(Math.min(uploadProgress.total, uploadProgress.done + 1)))
                  .replace("{total}", String(uploadProgress.total))}
              </p>
            </div>
          )}

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
            multiple
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addVideos(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          {/* Les deux boutons ajoutent à la même liste ; désactivés à 15 éléments (et à 5 vidéos pour le second) */}
          <div className="flex gap-2">
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={publishing || mediaFull} className={pickerButton}>
              <svg {...iconProps} className="h-5 w-5 shrink-0" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
              {preparing > 0 ? t("eventForm.photoPreparing") : t("eventForm.addPhoto")}
            </button>
            <button type="button" onClick={() => videoInputRef.current?.click()} disabled={publishing || videosFull} className={pickerButton}>
              <svg {...iconProps} className="h-5 w-5 shrink-0" strokeWidth={2}>
                <rect x="3" y="6" width="13" height="12" rx="2" />
                <path d="M16 10.5l5-3v9l-5-3z" />
              </svg>
              {videoPreparing > 0 ? t("publish.videoPreparing") : t("publish.addVideo")}
            </button>
          </div>
          <p aria-live="polite" className="mt-1.5 text-xs text-danger">
            {mediaError}
          </p>
        </section>

        {/* Son : son d'origine des vidéos et musique de la bibliothèque Vybe (pas d'import de fichier audio) */}
        <SoundSection value={soundChoice} onChange={setSoundChoice} hasVideo={videoCount > 0} disabled={publishing} />

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
