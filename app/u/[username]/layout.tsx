import type { Metadata } from "next";
import type { ReactNode } from "react";
import { shareMetadata } from "../../../lib/shareMetadata";
import { getProfilePreview } from "../../../lib/sharePreview";

// Aperçu des liens de profil partagés (/u/<pseudo>) : seulement pour un compte public (pseudo, nom, bio),
// sinon métadonnées génériques. La page elle-même reste réservée aux personnes connectées.
// Lu à chaque requête (connection() dans getProfilePreview) : un compte passé en privé n'a plus d'aperçu.
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

// La page (page.tsx) est dynamique elle aussi : c'est ce que Next 16 exige quand les métadonnées le sont.
export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
