import Image from "next/image";

// Image d'une carte : une vraie image, ou un dégradé avec l'émoji d'un sport (en attendant de vraies photos)
export type Media =
  | { kind: "image"; src: string; alt: string; position?: string } // position : ex. "50% 80%" (object-position)
  | { kind: "gradient"; emoji: string; alt: string; from: string; to: string };

// Remplit son parent (qui doit être en position relative et avoir une taille)
export default function MediaThumb({ media, sizes }: { media: Media; sizes: string }) {
  if (media.kind === "image") {
    return (
      <Image
        src={media.src}
        alt={media.alt}
        fill
        sizes={sizes}
        className="object-cover"
        style={media.position ? { objectPosition: media.position } : undefined}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={media.alt}
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: `radial-gradient(circle at 30% 20%, rgba(57,255,20,0.25), transparent 60%), linear-gradient(160deg, ${media.from}, ${media.to})` }}
    >
      <span aria-hidden="true" className="text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
        {media.emoji}
      </span>
    </div>
  );
}

// Durée posée en bas à droite d'une vignette vidéo (toujours sur fond sombre : lisible dans les deux thèmes)
export function DurationBadge({ duration }: { duration: string }) {
  return (
    <span aria-hidden="true" className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
      {duration}
    </span>
  );
}

export function PlayIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}
