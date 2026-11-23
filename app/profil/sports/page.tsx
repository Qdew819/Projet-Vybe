"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SportsPicker from "../../../components/SportsPicker";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";
import { loadMySports, saveMySports, type SportChoice } from "../../../lib/userSports";

// Étape après la ville : les sports pratiqués et le niveau (facultatif)
export default function QuelsSports() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [choices, setChoices] = useState<SportChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      // Sports déjà enregistrés (ou importés de l'ancien profil) : on part de ceux-là
      try {
        setChoices(await loadMySports(supabase, uid));
      } catch (err) {
        console.error(err);
      }
      setUserId(uid);
    });
  }, [router]);

  async function save() {
    if (!userId || choices.length === 0) return;
    setSaving(true);
    setError("");
    const message = await saveMySports(createClient(), userId, choices);
    if (message) {
      setSaving(false);
      setError(t(message));
      return;
    }
    router.push("/accueil");
  }

  if (!userId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">{t("sports.onboardingTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("sports.onboardingText")}</p>

        <div className="mt-8">
          <SportsPicker
            value={choices}
            onChange={(value) => {
              setChoices(value);
              setError("");
            }}
            disabled={saving}
          />
        </div>

        <p aria-live="polite" className="mt-6 min-h-5 text-sm text-danger">
          {error}
        </p>

        {/* Boutons collés en bas de l'écran : la liste des sports est longue sur mobile */}
        <div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-3 bg-background px-6 pb-4 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={choices.length === 0 || saving}
            aria-busy={saving}
            className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.continue")}
          </button>
          <button
            type="button"
            onClick={() => router.push("/accueil")}
            disabled={saving}
            className="w-full rounded-2xl py-3 text-sm font-bold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-60"
          >
            {t("sports.skip")}
          </button>
        </div>
      </div>
    </main>
  );
}
