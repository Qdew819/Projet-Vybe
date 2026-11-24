"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReelSkeleton } from "../../components/videos/ReelItem";
import VideoFeed from "../../components/videos/VideoFeed";

// Fil de vidéos plein écran : /videos (ou /videos?start=<id> pour commencer par une vidéo précise,
// et ?sport=<valeur de posts.sport> pour ne voir que ce sport, comme le filtre de l'accueil).
// Pas d'AppShell : la barre du bas est masquée, comme sur /publier.
export default function VideosPage() {
  return (
    <Suspense
      fallback={
        <main className="fixed inset-0 bg-black">
          <div className="mx-auto h-dvh w-full max-w-[480px]">
            <ReelSkeleton />
          </div>
        </main>
      }
    >
      <VideosFromParams />
    </Suspense>
  );
}

function VideosFromParams() {
  const params = useSearchParams();
  const start = params.get("start");
  const sport = params.get("sport") || null;
  // Nouvelle vidéo de départ ou nouveau sport : on repart d'un fil neuf
  return <VideoFeed key={`${start ?? ""}|${sport ?? ""}`} startId={start} sport={sport} />;
}
