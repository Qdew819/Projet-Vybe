import Image from "next/image";
import Link from "next/link";
import { useT } from "../../lib/i18n";
import { DurationBadge, PlayIcon } from "./MediaThumb";

// Vignette verticale de la rangée « Vidéos populaires » : affiche, petit bouton de lecture, durée, début de la légende
// sur 2 lignes (sans sauts de ligne, sans « Montrer plus ») et @pseudo de l'auteur en gris. Ouvre le fil de vidéos plein écran.
export default function VideoCard({
  href,
  poster,
  caption,
  author,
  duration,
}: {
  href: string;
  poster: string | null;
  caption: string; // texte de la publication ; les retours à la ligne deviennent des espaces
  author: string; // « @pseudo » (ou le nom si pas de pseudo)
  duration: string;
}) {
  const t = useT();
  const preview = caption.replace(/\s+/g, " ").trim();
  const title = preview || t("home.videoBy").replace("{name}", author);
  return (
    <Link
      href={href}
      aria-label={`${t("home.playTitled").replace("{title}", title).replace("{d}", duration)} — ${author}`}
      className="group block w-32 shrink-0 text-left focus-visible:outline-none"
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-line bg-black group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-ink">
        {poster ? (
          <Image src={poster} alt="" fill unoptimized sizes="128px" className="object-cover transition-transform group-hover:scale-105" />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 30% 20%, rgba(57,255,20,0.25), transparent 60%), linear-gradient(160deg, #0b2e14, #020702)" }}
          />
        )}
        <span
          aria-hidden="true"
          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
        </span>
        <DurationBadge duration={duration} />
      </span>
      {/* Début de la légende : 2 lignes au plus (hauteur fixe, pour que toutes les cartes aient la même taille) */}
      <span aria-hidden="true" className="mt-1.5 line-clamp-2 block h-[2.5em] break-words text-xs font-semibold leading-tight text-foreground">
        {preview}
      </span>
      <span aria-hidden="true" className="mt-0.5 block truncate whitespace-nowrap text-[11px] text-muted">
        {author}
      </span>
    </Link>
  );
}

export function VideoCardSkeleton() {
  return (
    <div aria-hidden="true" className="w-32 shrink-0">
      <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-surface" />
      <div className="mt-1.5 h-3 w-5/6 animate-pulse rounded bg-surface" />
      <div className="mt-1 h-2.5 w-1/2 animate-pulse rounded bg-surface" />
    </div>
  );
}
