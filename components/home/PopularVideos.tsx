"use client";

import { useEffect, useState, type ReactNode } from "react";
import VideoCard, { VideoCardSkeleton } from "./VideoCard";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";
import { errorDetails } from "../../lib/debugError"; // TEMP-DEBUG
import { fetchPopularVideos, formatDuration, type PopularVideos as Videos } from "../../lib/videos";

type Load = { status: "loading" } | { status: "error"; debug: string } | { status: "ready"; videos: Videos }; // TEMP-DEBUG : debug

// « Vidéos populaires » de l'accueil : popular_videos(12, sport du cercle choisi), auteurs et compteurs en requêtes groupées.
// wrap : la section de la page (titre, défilement horizontal). Rien n'est affiché s'il n'y a aucune vidéo.
export default function PopularVideos({ sport, wrap }: { sport: string | null; wrap: (content: ReactNode) => ReactNode }) {
  const t = useT();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [key, setKey] = useState(`${sport}|${attempt}`);

  // Nouveau sport ou nouvel essai : squelettes pendant la lecture (réglé pendant le rendu, pas dans l'effet)
  if (key !== `${sport}|${attempt}`) {
    setKey(`${sport}|${attempt}`);
    setLoad({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    fetchPopularVideos(createClient(), sport).then(
      (videos) => {
        if (!cancelled) setLoad({ status: "ready", videos });
      },
      async (err: unknown) => {
        console.error("TEMP-DEBUG vidéos populaires :", err, (err as { cause?: unknown })?.cause); // TEMP-DEBUG
        const { data } = await createClient().auth.getSession(); // TEMP-DEBUG
        if (!cancelled) setLoad({ status: "error", debug: `${errorDetails(err)} · session : ${data.session ? "oui" : "non"}` }); // TEMP-DEBUG
      }
    );
    return () => {
      cancelled = true;
    };
  }, [sport, attempt]);

  if (load.status === "ready" && load.videos.posts.length === 0) return null;

  if (load.status === "loading") {
    return wrap(
      <div role="status" aria-label={t("common.loading")} className="flex w-max gap-3 px-4">
        {[0, 1, 2, 3].map((n) => (
          <VideoCardSkeleton key={n} />
        ))}
      </div>
    );
  }

  if (load.status === "error") {
    return wrap(
      <p className="mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-danger">
        {t("home.videosError")}
        {/* TEMP-DEBUG */}
        <span className="block w-full select-text text-xs text-muted">Détails : {load.debug}</span>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 font-bold text-accent-ink underline">
          {t("eventForm.retry")}
        </button>
      </p>
    );
  }

  const { posts, people } = load.videos;
  return wrap(
    <ul className="flex w-max gap-3 px-4">
      {posts.map((post) => {
        const person = people.get(post.author_id);
        const author = person?.username ? `@${person.username}` : person?.displayName || t("event.member");
        return (
          <li key={post.id}>
            <VideoCard
              href={`/videos?start=${encodeURIComponent(post.id)}`}
              poster={post.video_poster_url ?? null}
              caption={post.body ?? ""}
              author={author}
              duration={formatDuration(post.video_duration_s)}
            />
          </li>
        );
      })}
    </ul>
  );
}
