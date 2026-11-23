"use client";

import { useT } from "../lib/i18n";
import type { FollowStatus } from "../lib/follows";

// Bouton d'abonnement : « Suivre » (ou « Suivre en retour »), « Demande envoyée » ou « ✓ Abonné ».
// - size « large » : bouton principal d'un profil (prend toute la place disponible)
// - size « small » : bouton compact à droite d'une ligne de personne
// Le nom de la personne est inclus dans l'aria-label (ex. « Suivre Alex »).
export default function FollowButton({
  status,
  busy,
  name,
  onFollow,
  onPending,
  onAccepted,
  followBack = false,
  size = "large",
}: {
  status: FollowStatus;
  busy: boolean;
  name: string;
  onFollow: () => void;
  onPending: () => void; // clic sur « Demande envoyée » (proposer d'annuler)
  onAccepted: () => void; // clic sur « Abonné » (proposer de se désabonner)
  followBack?: boolean; // « Suivre en retour » au lieu de « Suivre »
  size?: "large" | "small";
}) {
  const t = useT();
  const base =
    size === "large"
      ? "flex-1 rounded-2xl py-3 text-sm font-bold disabled:opacity-60"
      : "shrink-0 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60";
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

  if (status === "accepted") {
    return (
      <button
        type="button"
        onClick={onAccepted}
        disabled={busy}
        aria-busy={busy}
        aria-label={t("follow.followingLabel").replace("{name}", name)}
        className={`${base} ${focus} border-2 border-accent-ink text-accent-ink`}
      >
        {busy ? t("common.wait") : `✓ ${t("publicProfile.following")}`}
      </button>
    );
  }
  if (status === "pending") {
    return (
      <button
        type="button"
        onClick={onPending}
        disabled={busy}
        aria-busy={busy}
        aria-label={t("follow.requestedLabel").replace("{name}", name)}
        className={`${base} ${focus} border-2 border-line bg-surface text-foreground`}
      >
        {busy ? t("common.wait") : t("publicProfile.requested")}
      </button>
    );
  }
  const label = followBack ? t("follow.followBack") : t("publicProfile.follow");
  return (
    <button
      type="button"
      onClick={onFollow}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${label} ${name}`}
      className={`${base} ${focus} bg-accent text-on-accent`}
    >
      {busy ? t("common.wait") : label}
    </button>
  );
}
