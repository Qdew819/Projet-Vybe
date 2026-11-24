"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReelSkeleton } from "../../components/videos/ReelItem";
import VideoFeed from "../../components/videos/VideoFeed";

// Fil de vidéos plein écran : /videos (ou /videos?start=<id> pour commencer par une vidéo précise).
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
  const start = useSearchParams().get("start");
  // Nouvelle vidéo de départ : on repart d'un fil neuf
  return <VideoFeed key={start ?? ""} startId={start} />;
}
