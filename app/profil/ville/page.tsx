"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "../../../components/LocationPicker";
import Switch from "../../../components/Switch";
import type { CityValue } from "../../../lib/cities";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

// Étape après la création du profil : la ville (facultative)
export default function OuHabitesTu() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [city, setCity] = useState<CityValue | null>(null);
  // Désactivé par défaut : il s'active pour les 18 ans et plus une fois l'âge connu
  const [showOnProfile, setShowOnProfile] = useState(false);
  // Dès que la personne touche l'interrupteur, l'âge ne le change plus
  const touched = useRef(false);
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
      setUserId(uid);
      const { data: age, error: ageError } = await supabase.rpc("get_age", { uid });
      if (ageError) {
        console.error(`Calcul de l'âge impossible : ${ageError.message} (code ${ageError.code})`);
        return;
      }
      if (!touched.current && typeof age === "number") setShowOnProfile(age >= 18);
    });
  }, [router]);

  async function save() {
    if (!city || !userId) return;
    setSaving(true);
    setError("");
    const { error } = await createClient()
      .from("user_locations")
      .upsert({ user_id: userId, city_id: city.cityId, show_on_profile: showOnProfile }, { onConflict: "user_id" });
    if (error) {
      console.error(`Enregistrement de la ville impossible : ${error.message} (code ${error.code})`);
      setSaving(false);
      setError(t("location.saveError"));
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
        <h1 className="text-4xl font-black italic tracking-tight">{t("location.onboardingTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("location.onboardingText")}</p>

        <div className="mt-10">
          <LocationPicker
            value={city}
            onChange={(value) => {
              setCity(value);
              setError("");
            }}
          />
        </div>

        <div className="mt-6">
          <Switch
            id="afficher-ville"
            label={t("location.showOnProfile")}
            hint={t("location.showOnProfileHint")}
            checked={showOnProfile}
            onChange={(checked) => {
              touched.current = true;
              setShowOnProfile(checked);
            }}
          />
        </div>

        <p aria-live="polite" className="mt-6 min-h-5 text-sm text-danger">
          {error}
        </p>

        <div className="mt-auto flex flex-col gap-3 pt-10">
          <button
            type="button"
            onClick={save}
            disabled={!city || saving}
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
            {t("location.skip")}
          </button>
        </div>
      </div>
    </main>
  );
}
