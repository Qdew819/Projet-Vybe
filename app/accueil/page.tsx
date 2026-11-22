"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { useT } from "../../lib/i18n";
import { isLanguage, setLanguage } from "../../lib/language";
import { isThemeChoice, setTheme } from "../../lib/theme";

export default function Accueil() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const meta = data.user.user_metadata ?? {};

      // Affichage ou langue pas encore choisi : on passe par l'écran des préférences
      if (!isThemeChoice(meta.theme) || !isLanguage(meta.language)) {
        router.replace("/bienvenue");
        return;
      }
      setTheme(meta.theme);
      setLanguage(meta.language);

      // Profil pas encore rempli (aucune ligne ou pas de date de naissance) : on passe par la création du profil.
      // En cas d'erreur de lecture, on affiche quand même l'accueil plutôt que de bloquer la personne.
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("birth_date")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!error && !profile?.birth_date) {
        router.replace("/profil/creer");
        return;
      }

      const first = meta.first_name as string | undefined;
      const last = meta.last_name as string | undefined;
      const google = (meta.full_name ?? meta.name) as string | undefined;
      const display = first ? [first, last].filter(Boolean).join(" ") : google;
      setName(display || data.user.email || "");
      setReady(true);
    });
  }, [router]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        {t("common.loading")}
      </main>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          {t("home.hello")} <span className="text-accent-ink">{name}</span>!
        </h1>
        <p className="mt-3 text-muted">{t("home.subtitle")}</p>

        <button
          type="button"
          onClick={signOut}
          className="mt-auto rounded-2xl border border-accent-ink py-4 text-base font-bold text-accent-ink"
        >
          {t("home.signOut")}
        </button>
      </div>
    </main>
  );
}