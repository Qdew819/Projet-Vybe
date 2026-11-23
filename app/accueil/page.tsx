"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "../../components/Avatar";
import { createClient } from "../../lib/supabase/client";
import { useT } from "../../lib/i18n";
import { isLanguage, setLanguage } from "../../lib/language";
import { isThemeChoice, setTheme } from "../../lib/theme";

export default function Accueil() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [missingCity, setMissingCity] = useState(false);
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
        .select("birth_date, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      if (error) {
        console.error(
          `Lecture du profil impossible : ${error.message} (code ${error.code})` +
            (error.details ? ` — ${error.details}` : "") +
            (error.hint ? ` — ${error.hint}` : "")
        );
      }
      if (!error && !profile?.birth_date) {
        router.replace("/profil/creer");
        return;
      }

      const first = meta.first_name as string | undefined;
      const last = meta.last_name as string | undefined;
      const google = (meta.full_name ?? meta.name) as string | undefined;
      const display = first ? [first, last].filter(Boolean).join(" ") : google;
      setName(display || data.user.email || "");
      setAvatarUrl(typeof profile?.avatar_url === "string" && profile.avatar_url ? profile.avatar_url : null);

      // Demandes d'abonnement en attente : seulement le nombre, pour la pastille
      const { count, error: pendingError } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followed_id", data.user.id)
        .eq("status", "pending");
      if (pendingError) {
        console.error(`Lecture des demandes d'abonnement impossible : ${pendingError.message} (code ${pendingError.code})`);
      } else {
        setPendingRequests(count ?? 0);
      }

      // Pas encore de ville : on propose de l'ajouter (rien n'est affiché si la lecture échoue)
      const { data: location, error: locationError } = await supabase
        .from("user_locations")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (locationError) {
        console.error(`Lecture de la ville impossible : ${locationError.message} (code ${locationError.code})`);
      } else {
        setMissingCity(!location);
      }
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
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        {/* Trouver des personnes, juste à gauche des paramètres, avec la pastille des demandes en attente */}
        <Link
          href="/personnes"
          aria-label={
            pendingRequests > 0
              ? `${t("home.findPeople")} (${t("home.pendingBadge").replace("{n}", String(pendingRequests))})`
              : t("home.findPeople")
          }
          title={t("home.findPeople")}
          className="absolute right-16 top-4 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-accent-ink focus-visible:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
            <path d="M19 8v6M16 11h6" />
          </svg>
          {pendingRequests > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-accent px-1 text-[10px] font-black leading-none text-on-accent"
            >
              {pendingRequests > 9 ? "9+" : pendingRequests}
            </span>
          )}
        </Link>

        {/* Roue dentée des paramètres, dans le coin en haut à droite */}
        <Link
          href="/parametres"
          aria-label={t("home.settings")}
          title={t("home.settings")}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-accent-ink focus-visible:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>

        <Avatar
          src={avatarUrl}
          initial={(name || "?").charAt(0).toUpperCase()}
          alt={t("settings.avatarAlt")}
          size={80}
        />

        <h1 className="mt-6 text-4xl font-black italic tracking-tight">
          {t("home.hello")} <span className="text-accent-ink">{name}</span>!
        </h1>
        <p className="mt-3 text-muted">{t("home.subtitle")}</p>

        {missingCity && (
          <Link
            href="/profil/ville"
            className="mt-8 flex items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="min-w-0 flex-1 text-sm font-bold">{t("location.homeCard")}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}

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