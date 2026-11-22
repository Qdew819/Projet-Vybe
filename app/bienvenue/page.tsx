"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LanguagePicker from "../../components/LanguagePicker";
import ThemePicker from "../../components/ThemePicker";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";
import {
  getSavedLanguage,
  isLanguage,
  isLanguageAvailable,
  setLanguage,
  type Language,
} from "../../lib/language";
import { getSavedTheme, isThemeChoice, setTheme, type ThemeChoice } from "../../lib/theme";

export default function Bienvenue() {
  const router = useRouter();
  const t = useT();
  const [language, setLanguageChoice] = useState<Language>("fr");
  const [theme, setChoice] = useState<ThemeChoice>("dark");
  const [ready, setReady] = useState(false);
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
        const meta = data.user.user_metadata ?? {};
        setChoice(isThemeChoice(meta.theme) ? meta.theme : getSavedTheme());
        setLanguageChoice(
          isLanguage(meta.language) && isLanguageAvailable(meta.language) ? meta.language : getSavedLanguage()
        );
        setReady(true);
      });
  }, [router]);

  // Aperçu immédiat quand on touche une carte
  function chooseTheme(choice: ThemeChoice) {
    setChoice(choice);
    setTheme(choice);
  }

  function chooseLanguage(choice: Language) {
    if (!isLanguageAvailable(choice)) return;
    setLanguageChoice(choice);
    setLanguage(choice);
  }

  async function confirm() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: current } = await supabase.auth.getUser();
    // On garde les autres infos du profil (prénom, nom…)
    const { error } = await supabase.auth.updateUser({
      data: { ...(current.user?.user_metadata ?? {}), theme, language },
    });
    if (error) {
      setSaving(false);
      setError(t("prefs.saveError"));
      return;
    }
    setTheme(theme);
    setLanguage(language);
    router.push("/accueil");
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          {t("prefs.titleStart")} <span className="text-accent-ink">{t("prefs.titleAccent")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">{t("prefs.subtitle")}</p>

        <section className="mt-10" aria-labelledby="titre-langue">
          <h2 id="titre-langue" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("prefs.language")}
          </h2>
          <LanguagePicker value={language} onChange={chooseLanguage} />
        </section>

        <section className="mt-8" aria-labelledby="titre-affichage">
          <h2 id="titre-affichage" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("prefs.display")}
          </h2>
          <ThemePicker value={theme} onChange={chooseTheme} />
        </section>

        {error && (
          <p aria-live="polite" className="mt-6 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-auto pt-10">
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.continue")}
          </button>
        </div>
      </div>
    </main>
  );
}
