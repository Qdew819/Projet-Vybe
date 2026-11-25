"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import ConfirmDialog from "../../components/ConfirmDialog";
import MediaCarousel from "../../components/MediaCarousel";
import MediaEditor from "../../components/publish/MediaEditor";
import { FRAME_RATIO, VERTICAL_FRAME_RATIO, framedMediaStyle, type Framing } from "../../lib/framing";
import FramedBackground from "../../components/FramedBackground";
import TextOverlayLayer from "../../components/TextOverlayLayer";
import { drawTextBlocks, textAlt, toOverlays, type TextBlock } from "../../lib/textOverlay";
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
  POST_COLUMNS,
  mediaFiles,
  postErrorKey,
  postFiles,
  postMedia,
  removeFiles,
  removedFiles,
  renderFramedPhoto,
  type MediaItem,
  type PostRow,
} from "../../lib/posts";
import { initialsOf } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { useSportOptions, type SportOption } from "../../lib/sportOptions";
import { loadEpidemicTrack, loadTrack, postSound, reportEpidemicUsage } from "../../lib/music";
import { fromOverlays } from "../../lib/overlayData";
import { MUSIC_CLIP_SECONDS } from "../../lib/sound";
import { loadMySports } from "../../lib/userSports";
import {
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  captureFrameAt,
  formatDuration,
  legacyColumns,
  readVideo,
  removeMediaFiles,
  uploadPostMedia,
  type MediaDraft,
  videoContentType,
} from "../../lib/videos";

// Éléments choisis, dans l'ordre (photos déjà compressées, vidéos avec leur affiche capturée)
// Photo : original (fichier choisi, gardé jusqu'à l'envoi pour re-modifier sans perte), base (compressée, pleine
// image) et blob / preview (ce qui est envoyé et affiché : la base, ou la photo recadrée 4:5 après « Modifier »).
// Vidéo : jamais réencodée ; son cadrage (framing) et ses textes sont enregistrés dans posts.media.
// remote : élément déjà en ligne (modification d'une publication) ; il n'est renvoyé que s'il est modifié (photo).
type Draft =
  | {
      id: string;
      kind: "image";
      original: Blob | null;
      base: Blob | null;
      basePreview: string;
      blob: Blob | null; // null : photo en ligne non modifiée (rien à envoyer)
      preview: string;
      remote?: { url: string; source: string | null; alt: string };
      framing?: Framing;
      texts?: TextBlock[]; // textes de l'éditeur (redessinés depuis l'original à chaque modification)
    }
  | {
      id: string;
      kind: "video";
      file: File | null; // null : vidéo déjà en ligne
      remote?: { url: string; poster: string | null; duration: number };
      preview: string;
      duration: number;
      aspect: number | null;
      poster: Blob | null;
      posterPreview: string | null;
      posterChanged?: boolean; // miniature choisie avec le curseur (à envoyer, même pour une vidéo déjà en ligne)
      posterAt?: number; // instant de la miniature (secondes)
      framing?: Framing;
      texts?: TextBlock[]; // textes par-dessus la vidéo (enregistrés dans posts.media, sans réencodage)
    };

// Boutons « Ajouter une photo » / « Ajouter une vidéo » (désactivés : estompés, sans survol)
const pickerButton =
  "flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-ink/50 px-2 text-sm font-bold text-accent-ink transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-accent-ink/50";

// Seulement les aperçus locaux (blob:) ; les adresses des fichiers déjà en ligne ne se libèrent pas
function revokeUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function revokeDraft(draft: Draft) {
  revokeUrl(draft.preview);
  if (draft.kind === "image" && draft.basePreview !== draft.preview) revokeUrl(draft.basePreview);
  if (draft.kind === "video") revokeUrl(draft.posterPreview);
}

// Ce qui sera envoyé pour un élément : déjà en ligne et non modifié → gardé tel quel
function toMediaDraft(item: Draft): MediaDraft {
  if (item.kind === "image") {
    if (!item.blob && item.remote) {
      return {
        kind: "existing",
        item: {
          type: "image",
          url: item.remote.url,
          ...(item.remote.alt ? { alt: item.remote.alt } : {}),
          ...(item.remote.source ? { source: item.remote.source } : {}),
          ...(item.remote.source && item.framing ? { framing: item.framing } : {}),
          ...(item.remote.source && item.texts && item.texts.length > 0 ? { overlays: toOverlays(item.texts) } : {}),
        },
      };
    }
    const edited = Boolean(item.framing) || (item.texts?.length ?? 0) > 0;
    return {
      kind: "image",
      blob: item.blob ?? item.base!,
      alt: textAlt(item.texts),
      // Photo modifiée : sa photo de base est envoyée aussi, pour pouvoir la re-modifier plus tard
      source: edited ? item.base : null,
      framing: item.framing ?? null,
      overlays: toOverlays(item.texts ?? []),
    };
  }
  if (!item.file && item.remote) {
    const overlays = toOverlays(item.texts ?? []);
    return {
      kind: "existing",
      newPoster: item.posterChanged ? item.poster : null,
      item: {
        type: "video",
        url: item.remote.url,
        poster: item.remote.poster,
        duration_s: item.remote.duration || null,
        ...(item.framing ? { framing: item.framing } : {}),
        ...(overlays.length > 0 ? { overlays } : {}),
      },
    };
  }
  return {
    kind: "video",
    file: item.file!,
    duration: item.duration,
    poster: item.poster,
    framing: item.framing ?? null,
    overlays: toOverlays(item.texts ?? []),
  };
}

// Résumé comparable de ce qui est modifiable (changements non enregistrés en mode édition)
function snapshotOf(body: string, sport: string | null, eventId: string | null, sound: SoundChoice, items: Draft[]): string {
  return JSON.stringify({
    body: body.trim(),
    sport,
    eventId,
    sound: [sound.originalSound, sound.originalVolume, sound.track?.provider ?? null, sound.track?.id ?? null, sound.musicStart, sound.musicVolume],
    items: items.map((item) => [
      item.id,
      item.framing ?? null,
      item.texts ?? null,
      item.kind === "image" ? Boolean(item.blob) : Boolean(item.file) || Boolean(item.posterChanged),
    ]),
  });
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`);
  return response.blob();
}

// Mode Vidéo : aperçu vertical 9:16 (cadrage et textes compris), « Modifier », « Changer de vidéo », « × »,
// et curseur de la miniature (image de la vidéo)
function VideoModePreview({
  item,
  disabled,
  posterBusy,
  preparing,
  onChoose,
  onEdit,
  onRemove,
  onPosterAt,
}: {
  item: Extract<Draft, { kind: "video" }> | null;
  disabled: boolean;
  posterBusy: boolean;
  preparing: boolean;
  onChoose: () => void;
  onEdit: (id: string) => void;
  onRemove: (item: Draft) => void;
  onPosterAt: (id: string, at: number) => void;
}) {
  const t = useT();
  if (!item) {
    return (
      <div className="mb-3 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onChoose}
          disabled={disabled || preparing}
          className="flex aspect-[9/16] w-[min(100%,calc(55dvh*0.5625))] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent-ink/60 text-accent-ink transition-colors hover:border-accent-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <svg {...iconProps} className="h-10 w-10" strokeWidth={1.8}>
            <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          <span className="text-sm font-bold">{preparing ? t("publish.videoPreparing") : t("publish.videoChoose")}</span>
        </button>
        <p className="text-center text-xs text-muted">{t("publish.videoHint")}</p>
      </div>
    );
  }
  const framing: Framing = { ...(item.framing ?? { mode: "fill", scale: 1, x: 0, y: 0, background: "black" }), frame: VERTICAL_FRAME_RATIO };
  const aspect = item.framing?.aspect ?? item.aspect;
  const duration = Math.max(0, item.duration);
  return (
    <div className="mb-3 flex flex-col items-center gap-3">
      <div className="relative w-[min(100%,calc(55dvh*0.5625))] overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: VERTICAL_FRAME_RATIO }}>
        <FramedBackground framing={framing} poster={item.posterPreview} />
        <video
          src={item.preview}
          poster={item.posterPreview ?? undefined}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
          style={aspect ? framedMediaStyle(framing, aspect) : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {item.texts && item.texts.length > 0 && <TextOverlayLayer blocks={item.texts} />}
        <button
          type="button"
          onClick={() => onRemove(item)}
          disabled={disabled}
          aria-label={t("publish.removeVideo")}
          className="absolute left-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
        >
          <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onEdit(item.id)}
          disabled={disabled}
          className="absolute left-14 top-2 z-10 flex h-11 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
        >
          <svg {...iconProps} className="h-4 w-4" strokeWidth={2.2}>
            <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
          {t("editor.edit")}
        </button>
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
          {formatDuration(duration)}
        </span>
      </div>
      <button
        type="button"
        onClick={onChoose}
        disabled={disabled || preparing}
        className="min-h-11 rounded-full border-2 border-line px-5 text-sm font-bold transition-colors hover:border-accent-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        {preparing ? t("publish.videoPreparing") : t("publish.videoReplace")}
      </button>

      {/* Miniature : une image de la vidéo, choisie avec le curseur */}
      <div className="flex w-full items-center gap-3 rounded-2xl border-2 border-line bg-surface p-3">
        <span className="relative h-20 shrink-0 overflow-hidden rounded-lg bg-black" style={{ aspectRatio: VERTICAL_FRAME_RATIO }} aria-busy={posterBusy}>
          {item.posterPreview && (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la miniature, recadré comme la vidéo
            <img src={item.posterPreview} alt="" style={aspect ? framedMediaStyle(framing, aspect) : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {posterBusy && <span className="absolute inset-0 animate-pulse bg-white/20" />}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="miniature" className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>{t("publish.thumbnail")}</span>
            <span className="tabular-nums">{formatDuration(item.posterAt ?? 0)}</span>
          </label>
          <input
            id="miniature"
            type="range"
            min={0}
            max={Math.max(0.1, duration)}
            step={0.1}
            value={Math.min(item.posterAt ?? 0.5, duration)}
            disabled={disabled}
            onChange={(e) => onPosterAt(item.id, Number(e.target.value))}
            className="h-11 w-full cursor-pointer accent-[#39ff14]"
          />
          <p className="text-[11px] leading-snug text-muted">{t("publish.thumbnailHint")}</p>
        </div>
      </div>
    </div>
  );
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  // Mode édition (/publier?edit=<id>) : publication d'origine, état de départ (changements non enregistrés ?)
  const [editPost, setEditPost] = useState<PostRow | null>(null);
  // Type de publication : « post » (photos, texte, carrousel) ou « video » (une vidéo verticale, façon Reels).
  // Choisi dans la feuille « Créer » (/publier?type=video) ; en modification, celui de la publication (inchangé).
  const [postType, setPostType] = useState<"post" | "video">("post");
  const [posterBusy, setPosterBusy] = useState(false);
  const posterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

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
      let events = [...mine, ...joined];

      // Mode édition : la publication doit être la mienne, sinon retour à la publication avec un message
      const params = new URLSearchParams(window.location.search);
      const editId = params.get("edit");
      setPostType(params.get("type") === "video" ? "video" : "post");
      if (editId) {
        const { data: row, error: readError } = await supabase.from("posts").select(POST_COLUMNS).eq("id", editId).maybeSingle();
        const post = row as PostRow | null;
        if (readError || !post) {
          if (readError) console.error(`Lecture de la publication impossible : ${readError.message}`);
          router.replace("/accueil");
          return;
        }
        if (post.author_id !== uid) {
          router.replace(`/publication/${encodeURIComponent(editId)}?refus=1`);
          return;
        }
        // Événement lié déjà passé : ajouté à la liste pour rester visible et choisi
        if (post.event_id && !events.some((e) => e.id === post.event_id)) {
          const { data: linked } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", post.event_id).maybeSingle();
          if (linked) events = [...events, linked as EventRow];
        }
        const drafts = postMedia(post).map((m): Draft =>
          m.type === "image"
            ? {
                id: crypto.randomUUID(),
                kind: "image",
                original: null,
                base: null,
                // Photo modifiée dans l'éditeur : on repart de sa photo de base (non recadrée, sans texte)
                basePreview: m.source ?? m.url,
                blob: null,
                preview: m.url,
                framing: m.source && m.framing ? m.framing : undefined,
                texts: m.source && m.overlays ? fromOverlays(m.overlays, crypto.randomUUID()) : undefined,
                remote: { url: m.url, source: m.source ?? null, alt: m.alt ?? "" },
              }
            : {
                id: crypto.randomUUID(),
                kind: "video",
                file: null,
                preview: m.url,
                duration: m.duration_s ?? 0,
                aspect: m.framing?.aspect ?? null,
                poster: null,
                posterPreview: m.poster ?? null,
                framing: m.framing ?? undefined,
                texts: m.overlays ? fromOverlays(m.overlays, crypto.randomUUID()) : undefined,
                remote: { url: m.url, poster: m.poster ?? null, duration: m.duration_s ?? 0 },
              }
        );
        const sound = postSound(post);
        const track = sound.trackId ? await (sound.provider === "epidemic" ? loadEpidemicTrack(sound.trackId) : loadTrack(sound.trackId)) : null;
        const choice: SoundChoice = {
          originalSound: sound.originalSound,
          originalVolume: sound.originalVolume,
          track,
          musicStart: sound.start,
          musicVolume: sound.musicVolume,
        };
        itemsRef.current = drafts;
        setItems(drafts);
        setBody(post.body ?? "");
        setSport(post.sport);
        setEventId(post.event_id);
        setSoundChoice(choice);
        setEditPost(post);
        setPostType(post.kind === "video" ? "video" : "post");
        setInitialSnapshot(snapshotOf(post.body ?? "", post.sport, post.event_id, choice, drafts));
      }

      setMyEvents(events.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
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

  // Changements non enregistrés (mode édition) : comparés à l'état de départ
  const dirty = editPost !== null && initialSnapshot !== null && snapshotOf(body, sport, eventId, soundChoice, items) !== initialSnapshot;

  // Envoi en cours ou modifications non enregistrées : le navigateur demande une confirmation avant de quitter
  useEffect(() => {
    if (!publishing && !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t("publish.leaveWarning");
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [publishing, dirty, t]);

  // Sports : les miens d'abord, puis tous les autres
  const sports = useMemo(() => {
    const catalog = catalogState.status === "ready" ? catalogState.options : [];
    const mine = mySportIds.flatMap((id) => catalog.find((s) => s.id === id) ?? []);
    return [...mine, ...catalog.filter((s) => !mySportIds.includes(s.id))];
  }, [catalogState, mySportIds]);

  const videoCount = items.filter((item) => item.kind === "video").length;
  // Une vidéo (mode Vidéo) doit avoir sa vidéo ; un post, du texte ou au moins un élément
  const empty = postType === "video" ? !items.some((item) => item.kind === "video") : body.trim().length === 0 && items.length === 0;
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
        if (hasRoom("image")) {
          const url = URL.createObjectURL(blob);
          append({ id: crypto.randomUUID(), kind: "image", original: file, base: blob, basePreview: url, blob, preview: url });
        }
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
    // Mode Vidéo : UNE seule vidéo ; la nouvelle remplace l'ancienne
    if (postType === "video") {
      itemsRef.current.forEach(revokeDraft);
      itemsRef.current = [];
      setItems([]);
    }
    const single = postType === "video";
    const roomAll = single ? 1 : MAX_POST_MEDIA - items.length - preparing - videoPreparing;
    const roomVideos = single ? 1 : MAX_POST_VIDEOS - videoCount - videoPreparing;
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
            aspect: info.width && info.height ? info.width / info.height : null,
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

  // ---------- Éditeur de cadrage (« Modifier ») ----------

  function updateItem(id: string, patch: (draft: Draft) => Draft) {
    itemsRef.current = itemsRef.current.map((item) => (item.id === id ? patch(item) : item));
    setItems(itemsRef.current);
  }

  async function finishEditing(framing: Framing, texts: TextBlock[]) {
    const item = itemsRef.current.find((d) => d.id === editingId);
    if (!item) {
      setEditingId(null);
      return;
    }
    if (item.kind === "video") {
      // Vidéo : seulement le cadrage et les textes (pas de réencodage)
      updateItem(item.id, (d) => ({ ...d, framing, texts }));
      setEditingId(null);
      return;
    }
    // Photo : image 4:5 générée depuis l'original (ou la base si l'original ne se décode pas, ex. HEIC)
    setEditBusy(true);
    try {
      // Texte dessiné dans le même canvas, à la résolution réelle de l'image finale
      const overlay = texts.length > 0 ? (ctx: CanvasRenderingContext2D, W: number, H: number) => drawTextBlocks(ctx, texts, W, H) : undefined;
      // Photo déjà en ligne : sa photo de base est téléchargée (le Storage répond avec les en-têtes CORS)
      const source = item.original ?? item.base ?? (await fetchBlob(item.basePreview));
      const blob = await renderFramedPhoto(source, framing, overlay).catch(() =>
        item.base ? renderFramedPhoto(item.base, framing, overlay) : Promise.reject(new Error("Photo illisible"))
      );
      const preview = URL.createObjectURL(blob);
      updateItem(item.id, (d) => {
        if (d.kind !== "image") return d;
        if (d.preview !== d.basePreview) revokeUrl(d.preview);
        // Elle devient un nouveau fichier (l'ancien sera retiré du Storage après l'enregistrement)
        return { ...d, original: d.original ?? source, base: d.base ?? source, blob, preview, framing, texts, remote: undefined };
      });
      setEditingId(null);
    } catch (err) {
      console.error("Recadrage de la photo impossible :", err);
      setMediaError(t("editor.error"));
      setEditingId(null);
    }
    setEditBusy(false);
  }

  // Miniature de la vidéo (mode Vidéo) : image prise à l'instant choisi, capturée après une courte pause du curseur
  function choosePosterAt(id: string, at: number) {
    updateItem(id, (d) => (d.kind === "video" ? { ...d, posterAt: at } : d));
    if (posterTimer.current) clearTimeout(posterTimer.current);
    posterTimer.current = setTimeout(async () => {
      const item = itemsRef.current.find((d) => d.id === id);
      if (!item || item.kind !== "video") return;
      setPosterBusy(true);
      const blob = await captureFrameAt(item.file ?? item.preview, at);
      setPosterBusy(false);
      if (!blob) return;
      const posterPreview = URL.createObjectURL(blob);
      updateItem(id, (d) => {
        if (d.kind !== "video") return d;
        revokeUrl(d.posterPreview);
        return { ...d, poster: blob, posterPreview, posterChanged: true };
      });
    }, 250);
  }

  function moveItem(id: string, delta: -1 | 1) {
    const list = [...itemsRef.current];
    const from = list.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    itemsRef.current = list;
    setItems(list);
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
          items.map(toMediaDraft),
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
    const columns = {
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
    };

    // Modification : UPDATE (likes, commentaires et vues restent attachés à la même publication), puis seulement
    // ensuite suppression des fichiers retirés. En cas d'échec : on retire les nouveaux fichiers envoyés.
    if (editPost) {
      const uploaded = media.filter((m, i) => items[i] && toMediaDraft(items[i]).kind !== "existing");
      const { data: updated, error: updateError } = await supabase.from("posts").update(columns).eq("id", editPost.id).select("id");
      if (updateError || !updated || updated.length === 0) {
        console.error(updateError ? `Modification impossible : ${updateError.message} (code ${updateError.code})` : "Modification impossible : aucune ligne modifiée");
        await removeMediaFiles(supabase, uploaded);
        fail(updateError ? t(postErrorKey(updateError)) : t("post.errorGeneric"));
        return;
      }
      await removeFiles(supabase, removedFiles(postFiles(editPost), mediaFiles(media)));
      const before = postSound(editPost);
      if (track?.provider === "epidemic" && !(before.provider === "epidemic" && before.trackId === track.id)) reportEpidemicUsage(editPost.id);
      setInitialSnapshot(snapshotOf(body, sport, eventId, soundChoice, items)); // plus de changements en attente
      router.replace(`/publication/${encodeURIComponent(editPost.id)}?modifie=1`);
      return;
    }

    // kind : « post » ou « video » (jamais changé en modification)
    const { data: created, error: insertError } = await supabase.from("posts").insert({ author_id: me.id, kind: postType, ...columns }).select("id").single();
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

  function leave() {
    if (window.history.length > 1) router.back();
    else router.push(editPost ? `/publication/${encodeURIComponent(editPost.id)}` : "/accueil");
  }
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
            onClick={() => (dirty ? setDiscardOpen(true) : leave())}
            disabled={publishing}
            aria-label={t("common.back")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60"
          >
            <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-center text-lg font-bold">
            {postType === "video"
              ? editPost
                ? t("publish.editVideoTitle")
                : t("publish.videoTitle")
              : editPost
                ? t("publish.editTitle")
                : t("publish.title")}
          </h1>
          <button
            type="button"
            onClick={publish}
            disabled={empty || busy}
            aria-busy={publishing}
            className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {editPost ? (publishing ? t("publish.saving") : t("publish.save")) : publishing ? t("publish.publishing") : t("create.post")}
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
              placeholder={postType === "video" ? t("publish.caption") : t("feed.whatsNew")}
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
          {postType === "video" && (
            <VideoModePreview
              item={items.find((d): d is Extract<Draft, { kind: "video" }> => d.kind === "video") ?? null}
              disabled={publishing}
              posterBusy={posterBusy}
              onChoose={() => videoInputRef.current?.click()}
              onEdit={(id) => setEditingId(id)}
              onRemove={(item) => removeItem(item)}
              onPosterAt={choosePosterAt}
              preparing={videoPreparing > 0}
            />
          )}
          {postType === "post" && items.length > 0 && (
            // Même carrousel que les publications, dans l'ordre choisi ; « × » en haut à gauche de chaque élément
            <MediaCarousel
              items={items.map((item) =>
                item.kind === "image"
                  ? { type: "image", url: item.preview, alt: textAlt(item.texts) }
                  : {
                      type: "video",
                      url: item.preview,
                      poster: item.posterPreview,
                      duration_s: item.duration,
                      framing: item.framing ? { ...item.framing, aspect: item.framing.aspect ?? item.aspect ?? undefined } : null,
                      overlays: item.texts && item.texts.length > 0 ? toOverlays(item.texts) : null,
                    }
              )}
              preview
              zoomable={false}
              className="mb-2"
              overlay={(index) => {
                const item = items[index];
                if (!item) return null;
                return (
                  <>
                  {/* « Modifier » : recadrer dans le cadre 4:5 (éditeur plein écran) */}
                  <button
                    type="button"
                    onClick={() => setEditingId(item.id)}
                    disabled={publishing}
                    aria-label={t("editor.editItem").replace("{n}", String(index + 1))}
                    className="absolute left-14 top-2 z-10 flex h-11 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <svg {...iconProps} className="h-4 w-4" strokeWidth={2.2}>
                      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                      <path d="M13.5 6.5l4 4" />
                    </svg>
                    {t("editor.edit")}
                  </button>
                  {items.length > 1 && (
                    // Réordonner : vers la gauche / la droite (en haut au centre)
                    <span className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={publishing || index === 0}
                        aria-label={t("publish.moveLeft").replace("{n}", String(index + 1))}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <svg {...iconProps} className="h-4 w-4" strokeWidth={2.5}>
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={publishing || index === items.length - 1}
                        aria-label={t("publish.moveRight").replace("{n}", String(index + 1))}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <svg {...iconProps} className="h-4 w-4" strokeWidth={2.5}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                    </span>
                  )}
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
                  </>
                );
              }}
            />
          )}
          {postType === "post" && (
          <p className="mb-3 text-right text-xs font-semibold tabular-nums text-muted">
            {t("publish.mediaCount")
              .replace("{n}", String(items.length))
              .replace("{max}", String(MAX_POST_MEDIA))
              .replace("{v}", String(videoCount))
              .replace("{vmax}", String(MAX_POST_VIDEOS))}
          </p>
          )}

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
            multiple={postType === "post"}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void addVideos(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          {/* Les deux boutons ajoutent à la même liste ; désactivés à 15 éléments (et à 5 vidéos pour le second) */}
          {postType === "post" && (
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
          )}
          <p aria-live="polite" className="mt-1.5 text-xs text-danger">
            {mediaError}
          </p>
        </section>

        {/* Son : son d'origine des vidéos et musique de la bibliothèque Vybe (pas d'import de fichier audio) */}
        <SoundSection
          value={soundChoice}
          onChange={setSoundChoice}
          hasVideo={videoCount > 0}
          disabled={publishing}
          suggest={{
            // 1er élément du carrousel : sa clé change s'il est remplacé, recadré ou modifié
            key: items[0] ? `${items[0].id}:${items[0].preview}` : "none",
            kind: items[0] ? (items[0].kind === "image" ? "photo" : "video") : null,
            source: items[0]
              ? items[0].kind === "image"
                ? { kind: "image", blob: items[0].blob ?? items[0].base, url: items[0].preview }
                : { kind: "video", url: items[0].preview }
              : null,
            sport,
            text: body,
          }}
        />

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

      {(() => {
        const item = editingId ? items.find((d) => d.id === editingId) : undefined;
        if (!item) return null;
        return (
          <MediaEditor
            key={item.id}
            media={
              item.kind === "image"
                ? { kind: "image", src: item.basePreview, aspect: null }
                : { kind: "video", src: item.preview, poster: item.posterPreview, aspect: item.aspect }
            }
            initial={item.framing ?? null}
            initialTexts={item.texts ?? []}
            frameRatio={postType === "video" ? VERTICAL_FRAME_RATIO : FRAME_RATIO}
            busy={editBusy}
            onCancel={() => !editBusy && setEditingId(null)}
            onDone={(framing, texts) => void finishEditing(framing, texts)}
          />
        );
      })()}
      <ConfirmDialog
        open={discardOpen}
        title={t("publish.discardTitle")}
        description={t("publish.discardText")}
        confirmLabel={t("publish.discard")}
        danger
        onConfirm={() => {
          setDiscardOpen(false);
          setInitialSnapshot(null); // plus d'avertissement en quittant
          leave();
        }}
        onClose={() => setDiscardOpen(false)}
      />
    </main>
  );
}
