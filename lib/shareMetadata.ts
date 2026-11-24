import type { Metadata } from "next";
import { GENERIC_DESCRIPTION, GENERIC_TITLE, SITE_NAME } from "./sharePreview";

// Métadonnées des liens partagés : aperçus soignés (Open Graph, X), mais pas d'indexation par les moteurs de recherche.
// L'image vient du fichier opengraph-image.tsx de chaque page.
// En production, définir NEXT_PUBLIC_SITE_URL (ex. https://vybe.app) pour que les adresses des images soient complètes.
export function shareMetadata(content: { title: string; description: string } | null): Metadata {
  const title = content?.title ?? GENERIC_TITLE;
  const description = content?.description ?? GENERIC_DESCRIPTION;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    ...(site ? { metadataBase: new URL(site) } : {}),
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "fr_CA", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}
