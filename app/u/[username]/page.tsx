import { Suspense } from "react";
import { connection } from "next/server";
import ProfilPublic from "./ProfilPublic";

// /u/[username] : les métadonnées (aperçu du lien, layout.tsx) sont lues à chaque requête. Next 16 (cacheComponents)
// exige alors que la page soit dynamique elle aussi : connection() ci-dessous, dans un Suspense avec un squelette.
// Le profil lui-même reste affiché par le composant navigateur ProfilPublic.
export default function ProfilPublicPage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <DynamicProfile />
    </Suspense>
  );
}

async function DynamicProfile() {
  await connection();
  return <ProfilPublic />;
}

// Squelette : bannière, photo, nom, statistiques et boutons
function ProfileSkeleton() {
  return (
    <main className="bg-background text-foreground">
      <div role="status" aria-label="Chargement…" className="mx-auto w-full max-w-[500px]">
        <div className="aspect-[3/1] w-full animate-pulse bg-surface" />
        <div className="px-6">
          <div className="flex items-start gap-4">
            <div className="-mt-12 h-[104px] w-[104px] shrink-0 animate-pulse rounded-full border-4 border-background bg-surface" />
            <div className="flex flex-1 flex-col gap-2 pt-4">
              <div className="h-5 w-1/2 animate-pulse rounded bg-surface" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
            </div>
          </div>
          <div className="mt-6 h-12 w-full animate-pulse rounded-2xl bg-surface" />
          <div className="mt-5 flex gap-2">
            <div className="h-12 flex-1 animate-pulse rounded-2xl bg-surface" />
            <div className="h-12 w-12 animate-pulse rounded-2xl bg-surface" />
          </div>
        </div>
      </div>
    </main>
  );
}
