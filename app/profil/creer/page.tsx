"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useT, type MessageKey } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

const BIO_MAX = 160;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
// Lettres minuscules sans accent, chiffres, points et tirets bas
const USERNAME_PATTERN = /^[a-z0-9._]+$/;
const MIN_AGE = 16; // même âge minimum que l'inscription
const ADULT_AGE = 18;

type AccountType = "public" | "private";

const accountOptions: { value: AccountType; label: MessageKey; hint: MessageKey }[] = [
  { value: "public", label: "profile.public", hint: "profile.publicHint" },
  { value: "private", label: "profile.private", hint: "profile.privateHint" },
];

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/connexion");
          return;
        }
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

    if (username.length < USERNAME_MIN || !USERNAME_PATTERN.test(username)) {
      setError(t("profile.errorUsername"));
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
    const meta = data.user.user_metadata ?? {};
    const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const google = typeof (meta.full_name ?? meta.name) === "string" ? String(meta.full_name ?? meta.name).trim() : "";
    const displayName = (first ? [first, last].filter(Boolean).join(" ") : google) || username;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        username,
        display_name: displayName,
        birth_date: birthDate,
        bio: bio.trim() || null,
        is_private: accountType === "private",
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
      // 23505 : valeur déjà utilisée (nom d'utilisateur unique)
      setError(error.code === "23505" ? t("profile.errorUsernameTaken") : t("profile.saveError"));
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
          <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">
            {t("profile.username")}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-muted"
            >
              @
            </span>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              minLength={USERNAME_MIN}
              maxLength={USERNAME_MAX}
              placeholder={t("profile.usernamePlaceholder")}
              value={username}
              // On tape en minuscules : les majuscules sont converties, les espaces retirés
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              aria-describedby="username-hint"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <p id="username-hint" className="mt-1.5 text-xs text-muted">
            {t("profile.usernameHint")}
          </p>
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

        <fieldset className="mt-6">
          <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">
            {t("profile.accountType")}
          </legend>
          <p className="mb-3 text-sm font-semibold">{t("profile.accountQuestion")}</p>
          <div className="flex flex-col gap-3">
            {accountOptions.map((o) => {
              const selected = o.value === accountType;
              return (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
                    selected ? "border-accent-ink" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={o.value}
                    checked={selected}
                    onChange={() => setChosenType(o.value)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink"
                  />
                  <span className="flex flex-col gap-1">
                    <span className={`text-sm font-bold ${selected ? "text-accent-ink" : ""}`}>{t(o.label)}</span>
                    <span className="text-xs leading-snug text-muted">{t(o.hint)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">{t("profile.accountNote")}</p>
        </fieldset>

        {error && (
          <p aria-live="polite" className="mt-6 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-auto pt-10">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.continue")}
          </button>
        </div>
      </form>
    </main>
  );
}
