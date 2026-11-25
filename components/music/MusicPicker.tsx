"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "../../lib/i18n";
import {
  browseEpidemic,
  fetchActiveTracks,
  musicSource,
  searchEpidemic,
  type EpidemicBrowse,
  type EpidemicFilter,
  type MusicTrack,
} from "../../lib/music";
import { unlockAudio, useMusicPlayer } from "../../lib/sound";
import { normalizeSearch } from "../../lib/sports";
import { createClient } from "../../lib/supabase/client";
import { useCloseDialogOnHide } from "../../lib/useCloseDialogOnHide";
import { useMounted } from "../../lib/useMounted";
import { formatDuration } from "../../lib/videos";

type Tab = "epidemic" | "vybe";
type VybeLoad = { status: "loading" } | { status: "error" } | { status: "ready"; tracks: MusicTrack[] };
type EpidemicList = {
  status: "loading" | "error" | "ready";
  tracks: MusicTrack[];
  nextOffset: number | null;
  loadingMore: boolean;
  error?: string; // message réel (affiché seulement en développement)
};

const SEARCH_DELAY_MS = 300;
const LOADING: EpidemicList = { status: "loading", tracks: [], nextOffset: null, loadingMore: false };
const DEV = process.env.NODE_ENV === "development";

// Ambiances mises en avant : celles qui collent au sport d'abord (sport, course, énergie, épique, action…)
const SPORTY = /sport|run|workout|energ|epic|action|motivat|power|intense|hype|fight|drive|upbeat|powerful/i;
function sportyFirst<T extends { id: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(SPORTY.test(`${b.id} ${b.name}`)) - Number(SPORTY.test(`${a.id} ${a.name}`)));
}

// Panneau « Ajouter une musique » (feuille qui monte du bas sur téléphone, fenêtre centrée sur ordinateur).
// Deux onglets : Epidemic Sound (par défaut : recherche, ambiances, collections, pagination) et la bibliothèque Vybe.
// ▶ écoute un extrait (un seul à la fois, arrêté à la fermeture). Aucun import de fichier audio n'est possible.
// Si Epidemic Sound ne répond pas (crédits épuisés, clé invalide…), son onglet le dit et la bibliothèque Vybe
// reste utilisable.
export default function MusicPicker({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (track: MusicTrack) => void;
}) {
  const t = useT();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const [tab, setTab] = useState<Tab>("epidemic");
  const [preview, setPreview] = useState<MusicTrack | null>(null);

  // Vybe
  const [vybe, setVybe] = useState<VybeLoad>({ status: "loading" });
  const [vybeAttempt, setVybeAttempt] = useState(0);
  const [vybeQuery, setVybeQuery] = useState("");

  // Epidemic Sound
  const [browse, setBrowse] = useState<EpidemicBrowse | null>(null);
  const [termInput, setTermInput] = useState("");
  const [filter, setFilter] = useState<EpidemicFilter>({ term: "", mood: null, collection: null });
  const [list, setList] = useState<EpidemicList>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, mounted]);

  // Bibliothèque Vybe : lue à l'ouverture de l'onglet
  useEffect(() => {
    if (!open || tab !== "vybe") return;
    let cancelled = false;
    fetchActiveTracks(createClient()).then(
      (tracks) => !cancelled && setVybe({ status: "ready", tracks }),
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setVybe({ status: "error" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, tab, vybeAttempt]);

  // Epidemic Sound : ambiances et collections (une fois par ouverture ; facultatives)
  useEffect(() => {
    if (!open || tab !== "epidemic" || browse) return;
    const controller = new AbortController();
    browseEpidemic(controller.signal).then(
      (result) => setBrowse({ moods: sportyFirst(result.moods), collections: result.collections }),
      () => undefined // facultatif : la liste des morceaux s'affiche quand même
    );
    return () => controller.abort();
  }, [open, tab, browse]);

  // Recherche tapée : lancée après 300 ms sans frappe
  useEffect(() => {
    const timer = setTimeout(() => {
      if (termInput === filterRef.current.term) return;
      setList(LOADING);
      setFilter((current) => ({ term: termInput, mood: current.mood, collection: termInput ? null : current.collection }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [termInput]);

  // Première page pour le filtre courant : dès l'ouverture, sans rien taper (morceaux populaires), puis à chaque
  // recherche ou filtre. 10 s au plus (lib/music.ts) : ensuite « indisponible » avec « Réessayer ».
  useEffect(() => {
    if (!open || tab !== "epidemic") return;
    const controller = new AbortController();
    searchEpidemic(filter, 0, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setList({ status: "ready", tracks: page.tracks, nextOffset: page.nextOffset, loadingMore: false });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Epidemic Sound :", err);
        setList({ ...LOADING, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    );
    return () => controller.abort();
  }, [open, tab, filter, attempt]);

  function changeFilter(next: EpidemicFilter) {
    setList(LOADING);
    setFilter(next);
  }

  function retry() {
    setList(LOADING);
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (list.nextOffset === null || list.loadingMore) return;
    setList((current) => ({ ...current, loadingMore: true }));
    try {
      const page = await searchEpidemic(filter, list.nextOffset);
      setList((current) => ({
        status: "ready",
        tracks: [...current.tracks, ...page.tracks.filter((track) => !current.tracks.some((c) => c.id === track.id))],
        nextOffset: page.nextOffset,
        loadingMore: false,
      }));
    } catch (err) {
      console.warn(err);
      setList((current) => ({ ...current, loadingMore: false, nextOffset: null }));
    }
  }

  const vybeTracks = useMemo(() => {
    if (vybe.status !== "ready") return [];
    const words = normalizeSearch(vybeQuery).split(" ").filter(Boolean);
    if (words.length === 0) return vybe.tracks;
    return vybe.tracks.filter((track) => {
      const text = normalizeSearch(`${track.title} ${track.artist}`);
      return words.every((word) => text.includes(word));
    });
  }, [vybe, vybeQuery]);

  // Un seul extrait à la fois (depuis le début du morceau, 30 s en boucle)
  useMusicPlayer({ ownerKey: "music-picker", source: musicSource(preview), start: 0, volume: 1, playing: open && Boolean(preview) });

  function togglePreview(track: MusicTrack) {
    unlockAudio(); // pendant le geste : nécessaire pour le son sur iPhone
    setPreview((current) => (current && current.provider === track.provider && current.id === track.id ? null : track));
  }

  function choose(track: MusicTrack) {
    onChoose(track);
    dialogRef.current?.close();
  }

  const chip = (selected: boolean) =>
    `flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border-2 px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
      selected ? "border-accent-ink bg-accent-ink/10 text-accent-ink" : "border-line bg-surface hover:border-accent-ink"
    }`;
  const searchClass =
    "mt-3 min-h-11 w-full rounded-full border border-accent-ink/40 bg-surface px-4 text-base text-foreground outline-none placeholder:text-subtle focus:border-accent-ink";

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="music-picker-title"
      onClose={() => {
        setPreview(null);
        // À la prochaine ouverture : squelettes puis liste à jour (jamais l'erreur d'avant)
        if (list.status === "error") setList(LOADING);
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      // Pas de classe d'affichage (flex…) sur <dialog> : elle l'afficherait même fermé (Tailwind ne masque pas
      // les <dialog> fermés). La mise en page flex est sur le contenu.
      className="mx-auto mb-0 mt-auto h-[85dvh] w-full max-w-[500px] rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70 md:mb-auto md:rounded-3xl md:border-b"
    >
      <div className="flex h-full min-h-0 flex-col px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line md:hidden" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <h2 id="music-picker-title" className="text-lg font-bold">
            {t("sound.addMusic")}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Onglets */}
        <div role="tablist" aria-label={t("music.sources")} className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
          {(["epidemic", "vybe"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setPreview(null);
                setTab(value);
              }}
              className={`min-h-10 rounded-full text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                tab === value ? "bg-accent text-on-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {value === "epidemic" ? "Epidemic Sound" : t("music.library")}
            </button>
          ))}
        </div>

        {tab === "epidemic" ? (
          <>
            <label htmlFor="music-search-es" className="sr-only">
              {t("music.search")}
            </label>
            <input
              id="music-search-es"
              type="search"
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              placeholder={t("music.search")}
              className={searchClass}
            />
            {/* Ambiances et collections fournies par l'API (filtres facultatifs) */}
            {browse && (browse.moods.length > 0 || browse.collections.length > 0) && (
              <div className="-mx-5 mt-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ul className="flex w-max gap-2 py-1" aria-label={t("music.filters")}>
                  {browse.moods.map((mood) => (
                    <li key={`m-${mood.id}`}>
                      <button
                        type="button"
                        aria-pressed={filter.mood === mood.id}
                        onClick={() => changeFilter({ term: filter.term, mood: filter.mood === mood.id ? null : mood.id, collection: null })}
                        className={chip(filter.mood === mood.id)}
                      >
                        {mood.name}
                      </button>
                    </li>
                  ))}
                  {browse.collections.map((collection) => (
                    <li key={`c-${collection.id}`}>
                      <button
                        type="button"
                        aria-pressed={filter.collection === collection.id}
                        onClick={() => {
                          setTermInput("");
                          changeFilter({ term: "", mood: null, collection: filter.collection === collection.id ? null : collection.id });
                        }}
                        className={chip(filter.collection === collection.id)}
                      >
                        <span aria-hidden="true" className="mr-1">
                          ♫
                        </span>
                        {collection.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {list.status === "loading" && <ListSkeleton />}
              {list.status === "error" && (
                <div role="alert" className="flex flex-col items-start gap-3 py-4">
                  <p className="text-sm font-bold text-danger">{t("music.epidemicUnavailable")}</p>
                  {DEV && list.error && <p className="break-all font-mono text-[11px] leading-snug text-muted">{list.error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={retry}
                      className="min-h-11 rounded-full border-2 border-line px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-accent-ink"
                    >
                      {t("eventForm.retry")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("vybe")}
                      className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    >
                      {t("music.useVybe")}
                    </button>
                  </div>
                </div>
              )}
              {list.status === "ready" && list.tracks.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("music.noResult")}</p>}
              {list.status === "ready" && list.tracks.length > 0 && (
                <>
                  <TrackList tracks={list.tracks} preview={preview} onPreview={togglePreview} onChoose={choose} />
                  {list.nextOffset !== null && (
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={list.loadingMore}
                      aria-busy={list.loadingMore}
                      className="mt-2 min-h-11 w-full rounded-2xl border border-accent-ink text-sm font-bold text-accent-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent-ink"
                    >
                      {list.loadingMore ? t("common.loading") : t("feed.more")}
                    </button>
                  )}
                </>
              )}
            </div>
            {/* Mention de la source (aucune règle d'attribution précise trouvée dans la documentation de l'API) */}
            <p className="mt-2 text-center text-[11px] font-semibold text-muted">{t("music.byEpidemic")}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted">{t("music.libraryHint")}</p>
            <label htmlFor="music-search-vybe" className="sr-only">
              {t("music.search")}
            </label>
            <input
              id="music-search-vybe"
              type="search"
              value={vybeQuery}
              onChange={(e) => setVybeQuery(e.target.value)}
              placeholder={t("music.search")}
              className={searchClass}
            />
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {vybe.status === "loading" && <ListSkeleton />}
              {vybe.status === "error" && (
                <p className="flex flex-wrap items-center gap-3 py-4 text-sm text-danger">
                  {t("music.error")}
                  <button
                    type="button"
                    onClick={() => {
                      setVybe({ status: "loading" });
                      setVybeAttempt((n) => n + 1);
                    }}
                    className="min-h-11 font-bold text-accent-ink underline"
                  >
                    {t("eventForm.retry")}
                  </button>
                </p>
              )}
              {vybe.status === "ready" && vybeTracks.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">{vybe.tracks.length === 0 ? t("music.empty") : t("music.noResult")}</p>
              )}
              {vybe.status === "ready" && vybeTracks.length > 0 && (
                <TrackList tracks={vybeTracks} preview={preview} onPreview={togglePreview} onChoose={choose} />
              )}
            </div>
          </>
        )}
      </div>
    </dialog>,
    document.body
  );
}

function ListSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((n) => (
        <li key={n} className="flex items-center gap-3 py-1">
          <div className="h-12 w-12 animate-pulse rounded-lg bg-surface" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TrackList({
  tracks,
  preview,
  onPreview,
  onChoose,
}: {
  tracks: MusicTrack[];
  preview: MusicTrack | null;
  onPreview: (track: MusicTrack) => void;
  onChoose: (track: MusicTrack) => void;
}) {
  const t = useT();
  return (
    <ul className="flex flex-col">
      {tracks.map((track) => {
        const isPlaying = preview?.provider === track.provider && preview.id === track.id;
        return (
          <li key={`${track.provider}-${track.id}`} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
            <button
              type="button"
              onClick={() => onPreview(track)}
              aria-pressed={isPlaying}
              aria-label={(isPlaying ? t("music.pause") : t("music.play")).replace("{title}", track.title)}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {track.cover_url && <Image src={track.cover_url} alt="" fill unoptimized sizes="48px" className="object-cover" />}
              <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
                  </svg>
                )}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{track.title}</p>
              <p className="truncate text-xs text-muted">
                {track.artist}
                {track.duration_s ? ` · ${formatDuration(track.duration_s)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChoose(track)}
              aria-label={t("music.chooseTrack").replace("{title}", track.title).replace("{artist}", track.artist)}
              className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {t("music.choose")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
