"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BirthDateField from "../../../components/BirthDateField";
import { markBirthDateKnown } from "../../../components/BirthDateGate";
import { MIN_AGE, ageFrom, fetchMyBirthDate, saveBirthDate } from "../../../lib/birthDate";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

// « Complète ton profil » : comptes sans date de naissance (anciens comptes, connexion Google).
// BirthDateGate (app/template.tsx) envoie ici tant que private_profiles n'a pas de ligne pour la personne.
export default function CompleterProfil() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      // Déjà remplie (autre onglet, retour en arrière…) : rien à faire ici
      try {
        if (await fetchMyBirthDate(supabase, data.user.id)) {
          markBirthDateKnown(data.user.id);
          router.replace("/accueil");
          return;
        }
      } catch (err) {
        console.error(err);
      }
      setUserId(data.user.id);
    });
  }, [router]);

  async function save() {
    const age = ageFrom(birthDate);
    if (age === null) {
      setError(t("profile.errorBirthDate"));
      return;
    }
    if (age < MIN_AGE) {
      setError(t("profile.errorTooYoung"));
      return;
    }
    setSaving(true);
    setError("");
    // Moins de 18 ans : le compte passe en privé, comme à l'inscription
    const problem = await saveBirthDate(createClient(), userId, birthDate);
    if (problem) {
      console.error(`Enregistrement de la date de naissance impossible : ${problem}`);
      setSaving(false);
      setError(t("birth.saveError"));
      return;
    }
    markBirthDateKnown(userId);
    router.replace("/accueil");
  }

  if (!userId) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>;
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          {t("birth.completeStart")} <span className="text-accent-ink">{t("birth.completeAccent")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">{t("birth.completeText")}</p>

        <div className="mt-10">
          <p id="naissance-label" className="mb-1.5 block text-sm font-semibold">
            {t("profile.birthDate")}
          </p>
          <BirthDateField
            id="naissance"
            value={birthDate}
            onChange={(value) => {
              setBirthDate(value);
              setError("");
            }}
            invalid={!!error}
            describedBy="naissance-aide"
          />
          <p id="naissance-aide" className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {t("birth.private")}
          </p>
        </div>

        <p aria-live="polite" className="mt-6 min-h-5 text-sm text-danger">
          {error}
        </p>

        <div className="mt-auto pt-10">
          <button
            type="button"
            onClick={save}
            disabled={saving || !birthDate}
            aria-busy={saving}
            className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.continue")}
          </button>
        </div>
      </div>
    </main>
  );
}
