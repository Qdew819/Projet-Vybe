import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, genericOgImage, postOgImage } from "../../../lib/ogImage";
import { getPostPreview } from "../../../lib/sharePreview";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Image d'aperçu de /p/<id> : détails seulement si l'auteur a un compte public, sinon image générique
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostPreview(id);
  if (!post) return genericOgImage();
  return postOgImage({ username: post.username, excerpt: post.excerpt, imageUrl: post.imageUrl });
}
