import type { Metadata } from "next";
import type { ReactNode } from "react";
import { shareMetadata } from "../../../lib/shareMetadata";
import { getProfilePreview } from "../../../lib/sharePreview";

// Aperçu des liens de profil partagés (/u/<pseudo>) : seulement pour un compte public (pseudo, nom, bio),
// sinon métadonnées génériques. La page elle-même reste réservée aux personnes connectées.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfilePreview(decodeURIComponent(username));
  if (!profile) return shareMetadata(null);
  const name = profile.displayName ?? `@${profile.username}`;
  return shareMetadata({
    title: `${name} (@${profile.username}) · Vybe`,
    description: profile.bio || `Suis ${name} sur Vybe, le réseau social des sportifs.`,
  });
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
