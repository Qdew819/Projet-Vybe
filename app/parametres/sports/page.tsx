"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SportsPicker from "../../../components/SportsPicker";
import { useT, type MessageKey } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";
import { loadMySports, sameChoices, saveMySports, type SportChoice } from "../../../lib/userSports";

// Paramètres : mes sports et mon niveau dans chacun
export default function SportsEtNiveaux() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saved, setSaved] = useState<SportChoice[]>([]);
  const [choices, setChoices] = useState<SportChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | { error: MessageKey }>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setUserId(uid);
      try {
        const mine = await loadMySports(supabase, uid);
        setSaved(mine);
        setChoices(mine);
      } catch (err) {
        console.error(err);
        setLoadFailed(true);
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function save() {
    if (!userId) return;
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSaving(true);
    setStatus("idle");
    const message = await saveMySports(createClient(), userId, choices);
    setSaving(false);
    if (message) {
      setStatus({ error: message });
      return;
    }
    setSaved(choices);
    setStatus("saved");
    savedTimer.current = setTimeout(() => setStatus("idle"), 3000);
  }

  const unchanged = sameChoices(saved, choices);

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-6 pb-10 pt-8">
        <Link href="/parametres" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("sports.settingsTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("sports.onboardingText")}</p>

        <div className="mt-8" aria-busy={loading}>
          {loading ? (
            <p role="status" className="py-8 text-center text-sm text-muted">
              {t("common.loading")}
            </p>
          ) : loadFailed ? (
            <p role="alert" className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-danger">
              {t("sports.loadError")}
            </p>
          ) : (
            <SportsPicker
              value={choices}
              onChange={(value) => {
                setChoices(value);
                setStatus("idle");
              }}
              disabled={saving}
            />
          )}
        </div>

        <p aria-live="polite" className="mt-6 min-h-5 text-sm">
          {status === "saved" && <span className="font-semibold text-accent-ink">{t("sports.saved")}</span>}
          {typeof status === "object" && <span className="text-danger">{t(status.error)}</span>}
        </p>

        {!loading && !loadFailed && (
          <div className="sticky bottom-0 -mx-6 mt-auto bg-background px-6 pb-4 pt-4">
            <button
              type="button"
              onClick={save}
              disabled={saving || unchanged}
              aria-busy={saving}
              className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("settings.save")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
