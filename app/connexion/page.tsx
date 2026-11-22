"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import LanguageToggle from "../../components/LanguageToggle";
import SocialButtons from "../../components/SocialButtons";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";

export default function Connexion() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      setError(
        msg.includes("not confirmed")
          ? t("login.errorNotConfirmed")
          : t("login.errorInvalid")
      );
      return;
    }

    router.push("/accueil");
  }

  const fieldClass =
    "w-full rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink";

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-muted">
            {t("common.back")}
          </Link>
          <LanguageToggle />
        </div>

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("login.subtitle")}</p>

        <div className="mt-8">
          <SocialButtons />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
              {t("field.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t("field.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
              {t("field.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder={t("field.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {loading ? t("login.loading") : t("login.submit")}
          </button>

          {error && (
            <p aria-live="polite" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>

        <p className="mt-auto pt-10 text-center text-sm text-muted">
          {t("login.noAccount")}{" "}
          <Link href="/inscription" className="font-bold text-accent-ink">
            {t("login.createOne")}
          </Link>
        </p>
      </div>
    </main>
  );
}