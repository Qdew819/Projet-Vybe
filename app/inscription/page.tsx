"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import LanguageToggle from "../../components/LanguageToggle";
import SocialButtons from "../../components/SocialButtons";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";

type Status = { type: "error" | "info"; text: string } | null;

export default function Inscription() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: name, last_name: lastName } }
    });

    setLoading(false);

    if (error) {
      const text = error.message.toLowerCase().includes("already")
        ? t("signup.errorExists")
        : t("signup.errorGeneric");
      setStatus({ type: "error", text });
      return;
    }

    // Si Supabase ne demande pas de confirmation, la personne est déjà connectée
    if (data.session) {
      router.push("/accueil");
      return;
    }

    setStatus({
      type: "info",
      text: t("signup.checkEmail"),
    });
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

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">{t("signup.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("signup.subtitle")}</p>

        <div className="mt-8">
          <SocialButtons />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
              {t("field.firstName")}
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="given-name"
              placeholder={t("field.firstNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="lastName" className="mb-1.5 block text-sm font-semibold">
              {t("field.lastName")}
            </label>
            <input
              id="lastName"
              type="text"
              required
              autoComplete="family-name"
              placeholder={t("field.lastNamePlaceholder")}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldClass}
            />
          </div>

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
              minLength={8}
              autoComplete="new-password"
              placeholder={t("field.newPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-muted">
            <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink" />
            <span>{t("signup.terms")}</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
          >
            {loading ? t("signup.loading") : t("signup.submit")}
          </button>

          {status && (
            <p
              aria-live="polite"
              className={`text-sm ${status.type === "error" ? "text-danger" : "text-accent-ink"}`}
            >
              {status.text}
            </p>
          )}
        </form>

        <p className="mt-auto pt-10 text-center text-sm text-muted">
          {t("signup.hasAccount")}{" "}
          <Link href="/connexion" className="font-bold text-accent-ink">
            {t("signup.login")}
          </Link>
        </p>
      </div>
    </main>
  );
}