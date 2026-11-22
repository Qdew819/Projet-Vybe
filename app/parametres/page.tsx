"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountTypePicker, { type AccountType } from "../../components/AccountTypePicker";
import AvatarPicker from "../../components/AvatarPicker";
import UsernameField from "../../components/UsernameField";
import {
  AVATAR_MAX_BYTES,
  deleteAvatar,
  isAcceptedAvatar,
  isStoredAvatar,
  resizeAvatar,
  uploadAvatar,
} from "../../lib/avatar";
import { useT } from "../../lib/i18n";
import { BIO_MAX, UNIQUE_VIOLATION, isValidUsername } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";

// Nouvelle photo (de la photothèque ou de la caméra) à envoyer, avatar prêt à l'emploi, ou photo à retirer
type PendingAvatar =
  | { kind: "photo"; blob: Blob; preview: string }
  | { kind: "preset"; src: string }
  | { kind: "remove" }
  | null;

export default function Parametres() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  // Valeurs enregistrées dans la base, pour savoir si quelque chose a changé
  const [savedType, setSavedType] = useState<AccountType>("public");
  const [savedBio, setSavedBio] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [username, setUsername] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("public");
  const [bio, setBio] = useState("");
  // Photo : adresse enregistrée, et changement pas encore enregistré (aucun tant que c'est null)
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar>(null);
  const [preparingAvatar, setPreparingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username, is_private, bio, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      if (error) {
        console.error(`Lecture du profil impossible : ${error.message} (code ${error.code})`);
        setLoadFailed(true);
        setReady(true);
        return;
      }
      // Pas encore de profil : on le crée d'abord
      if (!profile) {
        router.replace("/profil/creer");
        return;
      }
      const currentType: AccountType = profile.is_private ? "private" : "public";
      const currentBio = typeof profile.bio === "string" ? profile.bio : "";
      const currentUsername = typeof profile.username === "string" ? profile.username : "";
      setUserId(data.user.id);
      setSavedUsername(currentUsername);
      setUsername(currentUsername);
      setSavedType(currentType);
      setAccountType(currentType);
      setSavedBio(currentBio);
      setBio(currentBio);
      setSavedAvatar(typeof profile.avatar_url === "string" && profile.avatar_url ? profile.avatar_url : null);
      setReady(true);
    });
  }, [router]);

  // Libère l'aperçu local de la photo quand il est remplacé ou quand on quitte la page
  const photoPreview = pendingAvatar?.kind === "photo" ? pendingAvatar.preview : null;
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // Photo de la photothèque ou prise avec la caméra
  async function pickPhoto(photo: Blob) {
    clearMessages();
    if (!isAcceptedAvatar(photo)) {
      setError(t("settings.avatarTypeError"));
      return;
    }
    if (photo.size > AVATAR_MAX_BYTES) {
      setError(t("settings.avatarSizeError"));
      return;
    }
    setPreparingAvatar(true);
    try {
      const blob = await resizeAvatar(photo);
      setPendingAvatar({ kind: "photo", blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      console.error("Préparation de la photo impossible :", err);
      setError(t("settings.avatarReadError"));
    } finally {
      setPreparingAvatar(false);
    }
  }

  function pickPreset(src: string) {
    clearMessages();
    setPendingAvatar(src === savedAvatar ? null : { kind: "preset", src });
  }

  function removeAvatar() {
    clearMessages();
    setPendingAvatar(savedAvatar !== null ? { kind: "remove" } : null);
  }

  // Dès qu'on modifie quelque chose, on efface l'ancien message
  function clearMessages() {
    setSuccess(false);
    setError("");
  }

  function chooseType(choice: AccountType) {
    setAccountType(choice);
    clearMessages();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessages();
    if (!isValidUsername(username)) {
      setError(t("profile.errorUsername"));
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // 1. Une nouvelle photo est envoyée d'abord, pour connaître son adresse
    let avatarUrl = savedAvatar;
    if (pendingAvatar?.kind === "photo") {
      try {
        avatarUrl = await uploadAvatar(supabase, userId, pendingAvatar.blob);
      } catch (err) {
        console.error("Envoi de la photo impossible :", err);
        setSaving(false);
        setError(t("settings.avatarUploadError"));
        return;
      }
    } else if (pendingAvatar?.kind === "preset") {
      avatarUrl = pendingAvatar.src;
    } else if (pendingAvatar?.kind === "remove") {
      avatarUrl = null;
    }

    // 2. Puis le profil
    const newBio = bio.trim();
    const { error } = await supabase
      .from("profiles")
      .update({ username, is_private: accountType === "private", bio: newBio || null, avatar_url: avatarUrl })
      .eq("id", userId);
    if (error) {
      setSaving(false);
      console.error(`Enregistrement des paramètres impossible : ${error.message} (code ${error.code})`);
      setError(error.code === UNIQUE_VIOLATION ? t("profile.errorUsernameTaken") : t("settings.saveError"));
      return;
    }

    // 3. Photo envoyée remplacée par un avatar ou retirée : on supprime le fichier stocké (sans bloquer si ça échoue)
    if (isStoredAvatar(savedAvatar) && !isStoredAvatar(avatarUrl)) {
      await deleteAvatar(supabase, userId).catch((err) => console.error("Suppression de la photo impossible :", err));
    }

    setSaving(false);
    setSavedAvatar(avatarUrl);
    setPendingAvatar(null);
    setSavedUsername(username);
    setSavedType(accountType);
    setSavedBio(newBio);
    setBio(newBio);
    setSuccess(true);
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  const unchanged =
    username === savedUsername &&
    accountType === savedType &&
    bio.trim() === savedBio &&
    pendingAvatar === null;
  // Ce qu'on montre : le changement en attente s'il y en a un, sinon la photo enregistrée
  const avatarSrc =
    pendingAvatar === null
      ? savedAvatar
      : pendingAvatar.kind === "photo"
        ? pendingAvatar.preview
        : pendingAvatar.kind === "preset"
          ? pendingAvatar.src
          : null;

  return (
    <main className="bg-background text-foreground">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-8">
        <Link href="/accueil" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">{t("settings.title")}</h1>

        {userId && (
          <>
            <div className="mt-10">
              <AvatarPicker
                src={avatarSrc}
                initial={(savedUsername || "?").charAt(0).toUpperCase()}
                busy={preparingAvatar || saving}
                onPickPhoto={pickPhoto}
                onPickPreset={pickPreset}
                onRemove={removeAvatar}
              />
            </div>

            <div className="mt-8">
              <UsernameField
                value={username}
                onChange={(value) => {
                  setUsername(value);
                  clearMessages();
                }}
              />
            </div>

            <div className="mt-6">
              <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold">
                {t("profile.bio")}
              </label>
              <textarea
                id="bio"
                rows={4}
                maxLength={BIO_MAX}
                placeholder={t("profile.bioPlaceholder")}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  clearMessages();
                }}
                aria-describedby="bio-count"
                className="w-full resize-none rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
              />
              <p id="bio-count" className="mt-1.5 text-right text-xs text-muted">
                {bio.length}/{BIO_MAX}
              </p>
            </div>

            <div className="mt-6">
              <AccountTypePicker value={accountType} onChange={chooseType} />
            </div>
          </>
        )}

        <p aria-live="polite" className="mt-6 text-sm">
          {loadFailed && <span className="text-danger">{t("settings.loadError")}</span>}
          {error && <span className="text-danger">{error}</span>}
          {success && <span className="text-accent-ink">{t("settings.saved")}</span>}
        </p>

        {userId && (
          <div className="mt-auto pt-10">
            <button
              type="submit"
              disabled={saving || preparingAvatar || unchanged}
              className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("settings.save")}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
