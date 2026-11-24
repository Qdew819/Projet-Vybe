import { ImageResponse } from "next/og";

// Images d'aperçu (1200 × 630) des liens partagés, dessinées avec next/og.
// Règle de next/og : tout élément qui a plusieurs enfants doit être en display: flex.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT = "Aperçu Vybe";

const NEON = "#39ff14";

function Wordmark() {
  return (
    <div style={{ display: "flex", fontSize: 44, fontWeight: 900, fontStyle: "italic", letterSpacing: -1, color: "#ffffff" }}>
      VY<span style={{ color: NEON }}>BE</span>
    </div>
  );
}

// Fond noir avec lueur verte néon ; photo assombrie en fond si fournie
function Frame({ background, children, wordmark = true }: { background?: string | null; children: React.ReactNode; wordmark?: boolean }) {
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#000000", color: "#ffffff" }}>
      {background && (
        // eslint-disable-next-line @next/next/no-img-element -- next/og ne connaît que <img>
        <img src={background} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
      )}
      {background ? (
        // Photo assombrie pour que le texte reste lisible
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.88))" }} />
      ) : (
        // Lueur verte néon depuis le coin en haut à droite (dégradé sur toute l'image : next/og coupe les éléments
        // qui dépassent et ne gère pas « radial-gradient(… at x y) »)
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            backgroundImage: "linear-gradient(215deg, rgba(57,255,20,0.40) 0%, rgba(57,255,20,0.12) 28%, rgba(0,0,0,0) 55%)",
          }}
        />
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, display: "flex", backgroundColor: NEON }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "64px 72px 56px" }}>
        {children}
        {wordmark ? <Wordmark /> : <div style={{ display: "flex" }} />}
      </div>
    </div>
  );
}

export function eventOgImage(event: { title: string; sportName: string; date: string; city: string | null; coverUrl: string | null }) {
  return new ImageResponse(
    (
      <Frame background={event.coverUrl}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: NEON }}>{event.sportName}</div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>{event.title}</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: "#d4d4d4" }}>
            {[event.date, event.city].filter(Boolean).join("  ·  ")}
          </div>
        </div>
      </Frame>
    ),
    OG_SIZE
  );
}

export function postOgImage(post: { username: string; excerpt: string; imageUrl: string | null }) {
  return new ImageResponse(
    (
      <Frame background={post.imageUrl}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: NEON }}>@{post.username}</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 54, fontWeight: 800, lineHeight: 1.2 }}>
            {post.excerpt ? `« ${post.excerpt} »` : "Une publication sur Vybe"}
          </div>
        </div>
      </Frame>
    ),
    OG_SIZE
  );
}

export function profileOgImage(profile: { username: string; displayName: string | null; avatarUrl: string | null }) {
  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", alignItems: "center" }}>
          {profile.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- next/og ne connaît que <img>
            <img
              src={profile.avatarUrl}
              alt=""
              width={200}
              height={200}
              style={{ width: 200, height: 200, borderRadius: 100, border: `6px solid ${NEON}`, objectFit: "cover", marginRight: 48 }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 900 }}>{profile.displayName ?? `@${profile.username}`}</div>
            <div style={{ display: "flex", marginTop: 12, fontSize: 38, color: NEON }}>@{profile.username}</div>
          </div>
        </div>
      </Frame>
    ),
    OG_SIZE
  );
}

// Contenu non public ou introuvable : image générique, sans aucune donnée
export function genericOgImage() {
  return new ImageResponse(
    (
      <Frame wordmark={false}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 120, fontWeight: 900, fontStyle: "italic", letterSpacing: -3 }}>
            VY<span style={{ color: NEON }}>BE</span>
          </div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 44, color: "#d4d4d4" }}>Le réseau social des sportifs</div>
        </div>
      </Frame>
    ),
    OG_SIZE
  );
}
