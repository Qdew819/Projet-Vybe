import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setTrackActive } from "./actions";
import { currentAdminId, serviceClient } from "../../../lib/admin";

export const metadata: Metadata = { title: "Bibliothèque musicale — Admin Vybe", robots: { index: false, follow: false } };

type Row = {
  id: string;
  title: string;
  artist: string;
  duration_s: number | null;
  license: string | null;
  license_url: string | null;
  is_active: boolean;
};

const duration = (seconds: number | null) => {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return seconds ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : "—";
};

// /admin/musique : liste des morceaux de music_tracks, avec activation / désactivation.
// Réservée aux comptes de ADMIN_USER_IDS (vérifié côté serveur ; les autres reçoivent une page introuvable).
// L'ajout d'un morceau se fait pour l'instant dans Supabase (table music_tracks, fichiers dans l'espace « music »).
export default function AdminMusicPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl bg-background px-4 py-8 text-foreground">
      <h1 className="text-2xl font-bold">Bibliothèque musicale</h1>
      <p className="mt-1 text-sm text-muted">
        Seuls les morceaux actifs sont proposés dans « Ajouter une musique ». Pour ajouter un morceau : Supabase → table
        music_tracks (fichier audio dans l’espace « music »).
      </p>
      <Suspense fallback={<p className="mt-6 text-muted">Chargement…</p>}>
        <TrackList />
      </Suspense>
    </main>
  );
}

async function TrackList() {
  // Toujours à la demande : sans cela, la vérification des droits pourrait être figée au moment du build
  await connection();
  if (!(await currentAdminId())) notFound();
  const admin = serviceClient();
  if (!admin) return <p className="mt-6 text-danger">La variable SUPABASE_SERVICE_ROLE_KEY est manquante sur le serveur.</p>;

  const { data, error } = await admin
    .from("music_tracks")
    .select("id, title, artist, duration_s, license, license_url, is_active")
    .order("title", { ascending: true });
  if (error) {
    console.error(`Lecture de music_tracks impossible : ${error.message} (code ${error.code})`);
    return <p className="mt-6 text-danger">Impossible de lire les morceaux.</p>;
  }
  const tracks = (data ?? []) as Row[];
  if (tracks.length === 0) return <p className="mt-6 text-muted">Aucun morceau pour l’instant.</p>;

  return (
    <ul className="mt-6 flex flex-col gap-2">
      {tracks.map((track) => (
        <li key={track.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{track.title}</p>
            <p className="truncate text-sm text-muted">
              {track.artist} · {duration(track.duration_s)} ·{" "}
              {track.license_url ? (
                <a href={track.license_url} target="_blank" rel="noopener noreferrer" className="underline">
                  {track.license || "Licence"}
                </a>
              ) : (
                track.license || "Licence non renseignée"
              )}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${track.is_active ? "bg-accent text-on-accent" : "border border-line text-muted"}`}
          >
            {track.is_active ? "Actif" : "Inactif"}
          </span>
          <form action={setTrackActive}>
            <input type="hidden" name="id" value={track.id} />
            <input type="hidden" name="active" value={track.is_active ? "0" : "1"} />
            <button
              type="submit"
              className="min-h-11 rounded-full border-2 border-accent-ink px-4 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {track.is_active ? "Désactiver" : "Activer"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
