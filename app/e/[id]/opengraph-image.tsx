import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, eventOgImage, genericOgImage } from "../../../lib/ogImage";
import { getEventPreview, shortEventDate } from "../../../lib/sharePreview";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Image d'aperçu de /e/<id> : détails seulement pour un événement public et non annulé, sinon image générique
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventPreview(id);
  if (!event) return genericOgImage();
  return eventOgImage({
    title: event.title,
    sportName: event.sportName,
    date: shortEventDate(event.startsAt),
    city: event.city,
    coverUrl: event.coverUrl,
  });
}
