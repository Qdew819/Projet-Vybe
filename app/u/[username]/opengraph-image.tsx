import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, genericOgImage, profileOgImage } from "../../../lib/ogImage";
import { getProfilePreview } from "../../../lib/sharePreview";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Image d'aperçu de /u/<pseudo> : seulement pour un compte public, sinon image générique
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfilePreview(decodeURIComponent(username));
  if (!profile) return genericOgImage();
  return profileOgImage(profile);
}
