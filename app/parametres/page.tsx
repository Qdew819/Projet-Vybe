"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountTypePicker, { type AccountType } from "../../components/AccountTypePicker";
import { useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";

export default function Parametres() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [saved, setSaved] = useState<AccountType>("public"); // valeur enregistrée dans la base
  const [accountType, setAccountType] = useState<AccountType>("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_private")
        .eq("id", data.user.id)
        .maybeSingle();
      if (error) {
        console.error(`Lecture du profil impossible : ${error.message} (code ${error.code})`);
        setLoadFailed(true);
        setReady(true);
        return;
      }
      // Pas encore de profil : on le crée d'abord
      if (!profile) {
        router.replace("/profil/creer");
        return;
      }
      const current: AccountType = profile.is_private ? "private" : "public";
      setUserId(data.user.id);
      setSaved(current);
      setAccountType(current);
      setReady(true);
    });
  }, [router]);

  function choose(choice: AccountType) {
    setAccountType(choice);
    setSuccess(false);
    setError("");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const { error } = await createClient()
      .from("profiles")
      .update({ is_private: accountType === "private" })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      console.error(`Enregistrement du type de compte impossible : ${error.message} (code ${error.code})`);
      setError(t("settings.saveError"));
      return;
    }
    setSaved(accountType);
    setSuccess(true);
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  const unchanged = accountType === saved;

  return (
    <main className="bg-background text-foreground">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-8">
        <Link href="/accueil" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">{t("settings.title")}</h1>

        {userId && (
          <div className="mt-10">
            <AccountTypePicker value={accountType} onChange={choose} />
          </div>
        )}

        <p aria-live="polite" className="mt-6 text-sm">
          {loadFailed && <span className="text-danger">{t("settings.loadError")}</span>}
          {error && <span className="text-danger">{error}</span>}
          {success && <span className="text-accent-ink">{t("settings.saved")}</span>}
        </p>

        {userId && (
          <div className="mt-auto pt-10">
            <button
              type="submit"
              disabled={saving || unchanged}
              className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("settings.save")}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
