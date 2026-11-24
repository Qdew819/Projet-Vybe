import Link from "next/link";

// État vide des listes d'événements (accueil et page Événements), avec le bouton « Créer un événement »
export default function EventsEmptyState({ title, text, cta }: { title: string; text: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-10 w-10 text-accent-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5" />
      </svg>
      <p className="mt-1 font-bold">{title}</p>
      <p className="text-sm text-muted">{text}</p>
      <Link
        href="/evenements/creer"
        className="mt-3 rounded-full bg-accent px-5 py-3 text-sm font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        {cta}
      </Link>
    </div>
  );
}
