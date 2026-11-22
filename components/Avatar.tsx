import Image from "next/image";

// Photo de profil ronde, ou l'initiale sur fond uni quand il n'y a pas de photo
export default function Avatar({
  src,
  initial,
  alt,
  size,
}: {
  src: string | null;
  initial: string;
  alt: string;
  size: number; // en pixels
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border-2 border-accent-ink bg-surface"
      style={{ width: size, height: size }}
    >
      {src ? (
        // Adresse Supabase, avatar ou aperçu local : affiché tel quel, sans l'optimisation de Next
        <Image src={src} alt={alt} fill sizes={`${size}px`} unoptimized className="object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center font-black italic text-accent-ink"
          style={{ fontSize: size * 0.38 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
