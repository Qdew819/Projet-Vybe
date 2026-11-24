import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { GenericInvite, OpenInVybe, PreviewCover, PreviewLoading, SharedLayout } from "../../../components/SharedPreview";
import { eventSharePath, loginPathWithReturn } from "../../../lib/share";
import { shareMetadata } from "../../../lib/shareMetadata";
import { eventDescription, getEventPreview, shortEventDate } from "../../../lib/sharePreview";
import { createClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

// Lien partagé d'un événement : /e/<id>. Visible sans compte, mais seulement pour un événement public et non annulé
// (titre, sport, date, lieu, ville, couverture). Jamais l'adresse exacte ni les participants.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventPreview(id);
  return shareMetadata(event ? { title: `${event.title} · Vybe`, description: eventDescription(event) } : null);
}

export default function SharedEventPage({ params }: Props) {
  // Cookies et base lus à la demande : dans un Suspense (cacheComponents)
  return (
    <Suspense fallback={<PreviewLoading />}>
      <SharedEvent params={params} />
    </Suspense>
  );
}

async function SharedEvent({ params }: Props) {
  const { id } = await params;

  // Déjà connecté : directement la vraie page de l'événement (ses règles d'accès décident)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(`/evenements/${encodeURIComponent(id)}`);

  const loginHref = loginPathWithReturn(eventSharePath(id));
  const event = await getEventPreview(id);
  if (!event) {
    return (
      <SharedLayout>
        <GenericInvite loginHref={loginHref} />
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <article className="flex flex-col gap-4">
        <PreviewCover src={event.coverUrl} fallback={event.sportEmoji} />
        <div>
          <p className="text-sm font-bold text-accent-ink">
            <span aria-hidden="true">{event.sportEmoji}</span> {event.sportName}
          </p>
          <h1 className="mt-1 text-2xl font-black leading-tight">{event.title}</h1>
        </div>
        <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
          <li className="flex gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
            </svg>
            <span className="font-semibold">{shortEventDate(event.startsAt)}</span>
          </li>
          <li className="flex gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="font-semibold">{[event.venueName, event.city].filter(Boolean).join(" · ")}</span>
          </li>
        </ul>
        <p className="text-sm text-muted">Connecte-toi pour voir les détails et t’inscrire.</p>
      </article>
      <OpenInVybe href={loginHref} />
    </SharedLayout>
  );
}
