import type { Framing } from "../lib/framing";

// Fond d'une vidéo recadrée en mode « Ajuster » : noir (rien à dessiner) ou affiche de la vidéo floutée
export default function FramedBackground({ framing, poster }: { framing: Framing; poster: string | null }) {
  if (framing.mode !== "fit" || framing.background !== "blur" || !poster) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- décor flouté (affiche déjà chargée par la vidéo)
    <img
      src={poster}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
    />
  );
}
