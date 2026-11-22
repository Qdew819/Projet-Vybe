"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AccountTypePicker, { type AccountType } from "../../../components/AccountTypePicker";
import AvatarPicker from "../../../components/AvatarPicker";
import ProfileHeader from "../../../components/ProfileHeader";
import UsernameDialog from "../../../components/UsernameDialog";
import { useT } from "../../../lib/i18n";
import { BIO_MAX, UNIQUE_VIOLATION, displayNameFromMetadata, isValidUsername } from "../../../lib/profile";
import { createClient } from "../../../lib/supabase/client";
import { useAvatarChoice } from "../../../lib/useAvatarChoice";

const MIN_AGE = 16; // même âge minimum que l'inscription
const ADULT_AGE = 18;

// Date du jour au format AAAA-MM-JJ (heure locale), pour la limite du champ date
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Âge en années complètes à partir d'une date AAAA-MM-JJ, ou null si la date est vide ou invalide
function ageFrom(birthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayPassed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

export default function CreerProfil() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [bio, setBio] = useState("");
  const [chosenType, setChosenType] = useState<AccountType | null>(null);
  const [metaName, setMetaName] = useState(""); // nom affiché tiré de l'inscription ou de Google
  const [editingUsername, setEditingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Photo facultative : pas encore de photo enregistrée à la création
  const avatar = useAvatarChoice(null, (key) => setError(t(key)));

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/connexion");
          return;
        }
        setMetaName(displayNameFromMetadata(data.user.user_metadata ?? {}));
        setReady(true);
      });
  }, [router]);

  const age = ageFrom(birthDate);
  // Tant que la personne n'a pas choisi elle-même, on suit l'âge : moins de 18 ans → privé
  const suggestedType: AccountType = age !== null && age < ADULT_AGE ? "private" : "public";
  const accountType = chosenType ?? suggestedType;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // Nom d'utilisateur pas encore choisi : on ouvre directement la fenêtre pour le choisir
    if (!isValidUsername(username)) {
      setError(t("profile.errorUsernameMissing"));
      setEditingUsername(true);
      return;
    }
    if (age === null) {
      setError(t("profile.errorBirthDate"));
      return;
    }
    if (age < MIN_AGE) {
      setError(t("profile.errorTooYoung"));
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace("/connexion");
      return;
    }

    // Nom affiché : prénom et nom de l'inscription, sinon le nom Google, sinon le nom d'utilisateur
    const displayName = displayNameFromMetadata(data.user.user_metadata ?? {}) || username;

    // Photo choisie : envoyée d'abord, pour connaître son adresse
    let avatarUrl: string | null = null;
    if (avatar.changed) {
      try {
        avatarUrl = await avatar.upload(supabase, data.user.id);
      } catch (err) {
        console.error("Envoi de la photo impossible :", err);
        setSaving(false);
        setError(t("settings.avatarUploadError"));
        return;
      }
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        username,
        display_name: displayName,
        birth_date: birthDate,
        bio: bio.trim() || null,
        is_private: accountType === "private",
        // Sans photo choisie, on ne touche pas à avatar_url
        ...(avatar.changed ? { avatar_url: avatarUrl } : {}),
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error(
        `Enregistrement du profil impossible : ${error.message} (code ${error.code})` +
          (error.details ? ` — ${error.details}` : "") +
          (error.hint ? ` — ${error.hint}` : "")
      );
      setSaving(false);
      if (error.code === UNIQUE_VIOLATION) {
        setError(t("profile.errorUsernameTaken"));
        setEditingUsername(true);
      } else {
        setError(t("profile.saveError"));
      }
      return;
    }
    router.push("/accueil");
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  const fieldClass =
    "w-full rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink";

  return (
    <main className="bg-background text-foreground">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          {t("profile.titleStart")} <span className="text-accent-ink">{t("profile.titleAccent")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">{t("profile.subtitle")}</p>

        <div className="mt-10">
          <ProfileHeader
            displayName={metaName}
            username={username}
            onEditUsername={() => {
              setError("");
              setEditingUsername(true);
            }}
            avatar={
              <AvatarPicker
                size={80}
                src={avatar.src}
                initial={(username || metaName || "?").charAt(0).toUpperCase()}
                busy={avatar.preparing || saving}
                onPickPhoto={(photo) => {
                  setError("");
                  avatar.pickPhoto(photo);
                }}
                onPickPreset={(src) => {
                  setError("");
                  avatar.pickPreset(src);
                }}
                onRemove={() => {
                  setError("");
                  avatar.remove();
                }}
              />
            }
          />
          {/* Ici le nom est seulement gardé : il est enregistré avec le reste au clic sur « Continuer » */}
          <UsernameDialog
            open={editingUsername}
            value={username}
            confirmLabel={t("common.confirm")}
            initialError={error}
            onConfirm={async (newUsername) => {
              setUsername(newUsername);
              return null;
            }}
            onClose={() => {
              setEditingUsername(false);
              setError("");
            }}
          />
        </div>

        <div className="mt-6">
          <label htmlFor="birthDate" className="mb-1.5 block text-sm font-semibold">
            {t("profile.birthDate")}
          </label>
          <input
            id="birthDate"
            type="date"
            required
            autoComplete="bday"
            max={todayIso()}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs text-muted">{t("profile.birthDateHint")}</p>
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
            onChange={(e) => setBio(e.target.value)}
            aria-describedby="bio-count"
            className={`${fieldClass} resize-none`}
          />
          <p id="bio-count" className="mt-1.5 text-right text-xs text-muted">
            {bio.length}/{BIO_MAX}
          </p>
        </div>

        <div className="mt-6">
          <AccountTypePicker value={accountType} onChange={setChosenType} note={t("profile.accountNote")} />
        </div>

        {error && (
          <p aria-live="polite" className="mt-6 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-auto pt-10">
          <button
            type="submit"
            disabled={saving || avatar.preparing}
            className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.continue")}
          </button>
        </div>
      </form>
    </main>
  );
}
