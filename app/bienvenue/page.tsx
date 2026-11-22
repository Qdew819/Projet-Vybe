"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemePicker from "../../components/ThemePicker";
import { createClient } from "../../lib/supabase/client";
import { getSavedTheme, isThemeChoice, setTheme, type ThemeChoice } from "../../lib/theme";

export default function Bienvenue() {
  const router = useRouter();
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
        const saved = data.user.user_metadata?.theme;
        setChoice(isThemeChoice(saved) ? saved : getSavedTheme());
        setReady(true);
      });
  }, [router]);

  // Aperçu immédiat quand on touche une carte
  function choose(choice: ThemeChoice) {
    setChoice(choice);
    setTheme(choice);
  }

  async function confirm() {
    setSaving(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ data: { theme } });
    if (error) {
      setSaving(false);
      setError("Impossible d’enregistrer ton choix pour l’instant. Réessaie dans un instant.");
      return;
    }
    setTheme(theme);
    router.push("/accueil");
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">Chargement…</main>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          Choisis ton <span className="text-accent-ink">affichage</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Tu pourras le changer plus tard.</p>

        <div className="mt-10">
          <ThemePicker value={theme} onChange={choose} />
        </div>

        {error && (
          <p aria-live="polite" className="mt-6 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          className="mt-auto rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Continuer"}
        </button>
      </div>
    </main>
  );
}
