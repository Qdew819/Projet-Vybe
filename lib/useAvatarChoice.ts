"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "./i18n";
import {
  AVATAR_MAX_BYTES,
  deleteAvatar,
  isAcceptedAvatar,
  isStoredAvatar,
  resizeAvatar,
  uploadAvatar,
} from "./avatar";

// Nouvelle photo (photothèque ou caméra) à envoyer, avatar prêt à l'emploi, ou photo à retirer
type PendingAvatar =
  | { kind: "photo"; blob: Blob; preview: string }
  | { kind: "preset"; src: string }
  | { kind: "remove" }
  | null;

// Choix de la photo de profil, partagé par la création du profil et les paramètres.
// Rien n'est envoyé avant l'enregistrement du formulaire.
export function useAvatarChoice(saved: string | null, onError: (key: MessageKey) => void) {
  const [pending, setPending] = useState<PendingAvatar>(null);
  const [preparing, setPreparing] = useState(false);

  // Libère l'aperçu local de la photo quand il est remplacé ou quand on quitte la page
  const preview = pending?.kind === "photo" ? pending.preview : null;
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pickPhoto(photo: Blob) {
    if (!isAcceptedAvatar(photo)) return onError("settings.avatarTypeError");
    if (photo.size > AVATAR_MAX_BYTES) return onError("settings.avatarSizeError");
    setPreparing(true);
    try {
      const blob = await resizeAvatar(photo);
      setPending({ kind: "photo", blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      console.error("Préparation de la photo impossible :", err);
      onError("settings.avatarReadError");
    } finally {
      setPreparing(false);
    }
  }

  function pickPreset(src: string) {
    setPending(src === saved ? null : { kind: "preset", src });
  }

  function remove() {
    setPending(saved !== null ? { kind: "remove" } : null);
  }

  // Ce qu'on montre : le changement en attente s'il y en a un, sinon la photo enregistrée
  const src =
    pending === null
      ? saved
      : pending.kind === "photo"
        ? pending.preview
        : pending.kind === "preset"
          ? pending.src
          : null;

  // À appeler avant d'enregistrer le profil : envoie la nouvelle photo s'il y en a une
  // et renvoie l'adresse à mettre dans avatar_url. Lève une erreur si l'envoi échoue.
  async function upload(supabase: SupabaseClient, userId: string): Promise<string | null> {
    if (pending?.kind === "photo") return uploadAvatar(supabase, userId, pending.blob);
    if (pending?.kind === "preset") return pending.src;
    if (pending?.kind === "remove") return null;
    return saved;
  }

  // À appeler après l'enregistrement du profil : supprime la photo stockée si elle n'est plus utilisée
  async function cleanUp(supabase: SupabaseClient, userId: string, newUrl: string | null) {
    if (isStoredAvatar(saved) && !isStoredAvatar(newUrl)) {
      await deleteAvatar(supabase, userId).catch((err) => console.error("Suppression de la photo impossible :", err));
    }
    setPending(null);
  }

  return { src, preparing, changed: pending !== null, pickPhoto, pickPreset, remove, upload, cleanUp };
}
