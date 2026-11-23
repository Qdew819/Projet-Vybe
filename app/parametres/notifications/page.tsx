"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, type MessageKey } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

type WhoCanMessage = "everyone" | "followers" | "nobody";
type NotifyKey = "notify_messages" | "notify_following_posts" | "notify_events" | "notify_follow_requests";
type Settings = Record<NotifyKey, boolean> & { who_can_message: WhoCanMessage };

// Valeurs utilisées tant qu'il n'y a pas de ligne dans user_settings (mêmes que les défauts de la table)
const DEFAULTS: Settings = {
  notify_messages: true,
  notify_following_posts: true,
  notify_events: true,
  notify_follow_requests: true,
  who_can_message: "followers",
};

const SWITCHES: { key: NotifyKey; label: MessageKey; hint?: MessageKey }[] = [
  { key: "notify_messages", label: "notifications.messages" },
  { key: "notify_following_posts", label: "notifications.followingPosts" },
  { key: "notify_events", label: "notifications.events", hint: "notifications.eventsHint" },
  { key: "notify_follow_requests", label: "notifications.followRequests" },
];

const MESSAGE_OPTIONS: { value: WhoCanMessage; label: MessageKey; hint?: MessageKey }[] = [
  { value: "everyone", label: "notifications.everyone" },
  { value: "followers", label: "notifications.followers", hint: "notifications.followersHint" },
  { value: "nobody", label: "notifications.nobody" },
];

function isWho(value: unknown): value is WhoCanMessage {
  return value === "everyone" || value === "followers" || value === "nobody";
}

export default function Notifications() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  // Numéro de la dernière demande par réglage : une ancienne réponse ne remet pas une valeur dépassée
  const requestIds = useRef<Partial<Record<keyof Settings, number>>>({});
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
      const { data: row, error } = await supabase
        .from("user_settings")
        .select("notify_messages, notify_following_posts, notify_events, notify_follow_requests, who_can_message")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) {
        console.error(`Lecture des réglages impossible : ${error.message} (code ${error.code})`);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      if (row) {
        setSettings({
          notify_messages: typeof row.notify_messages === "boolean" ? row.notify_messages : DEFAULTS.notify_messages,
          notify_following_posts:
            typeof row.notify_following_posts === "boolean" ? row.notify_following_posts : DEFAULTS.notify_following_posts,
          notify_events: typeof row.notify_events === "boolean" ? row.notify_events : DEFAULTS.notify_events,
          notify_follow_requests:
            typeof row.notify_follow_requests === "boolean" ? row.notify_follow_requests : DEFAULTS.notify_follow_requests,
          who_can_message: isWho(row.who_can_message) ? row.who_can_message : DEFAULTS.who_can_message,
        });
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // Met l'écran à jour tout de suite, enregistre, et remet l'ancienne valeur si ça échoue
  async function save<K extends keyof Settings>(key: K, value: Settings[K]) {
    const previous = settings[key];
    if (previous === value || !userId) return;
    const requestId = (requestIds.current[key] ?? 0) + 1;
    requestIds.current[key] = requestId;
    setSettings((s) => ({ ...s, [key]: value }));
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setStatus("idle");

    const { error } = await createClient()
      .from("user_settings")
      .upsert({ user_id: userId, [key]: value, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

    if (requestIds.current[key] !== requestId) return; // un changement plus récent a pris le relais
    if (error) {
      console.error(`Enregistrement du réglage impossible : ${error.message} (code ${error.code})`);
      setSettings((s) => ({ ...s, [key]: previous }));
      setStatus("error");
      return;
    }
    setStatus("saved");
    savedTimer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  const disabled = loading || loadFailed;

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-6 pb-12 pt-8">
        <Link href="/parametres" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("notifications.title")}</h1>

        <p aria-live="polite" className="mt-4 min-h-5 text-sm">
          {loading && <span className="text-muted">{t("common.loading")}</span>}
          {loadFailed && <span className="text-danger">{t("notifications.loadError")}</span>}
          {status === "error" && <span className="text-danger">{t("notifications.saveError")}</span>}
          {status === "saved" && <span className="font-semibold text-accent-ink">{t("notifications.saved")}</span>}
        </p>

        <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <section aria-labelledby="titre-notifications" className="mt-6">
            <h2 id="titre-notifications" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              {t("notifications.section")}
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border-2 border-line bg-surface">
              {SWITCHES.map((s) => {
                const on = settings[s.key];
                const id = `switch-${s.key}`;
                return (
                  <li key={s.key} className="flex items-center gap-4 p-4">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <label htmlFor={id} id={`${id}-label`} className={`text-sm font-bold ${disabled ? "" : "cursor-pointer"}`}>
                        {t(s.label)}
                      </label>
                      {s.hint && (
                        <span id={`${id}-hint`} className="text-xs leading-snug text-muted">
                          {t(s.hint)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      id={id}
                      role="switch"
                      aria-checked={on}
                      aria-labelledby={`${id}-label`}
                      aria-describedby={s.hint ? `${id}-hint` : undefined}
                      disabled={disabled}
                      onClick={() => save(s.key, !on)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed ${
                        on ? "border-accent-ink bg-accent" : "border-muted bg-background"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 rounded-full transition-transform ${
                          on ? "translate-x-[22px] bg-on-accent" : "translate-x-0.5 bg-muted"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs leading-snug text-muted">{t("notifications.soon")}</p>
          </section>

          <fieldset className="mt-10" disabled={disabled}>
            <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              {t("notifications.whoCanMessage")}
            </legend>
            <div className="flex flex-col gap-3">
              {MESSAGE_OPTIONS.map((o) => {
                const selected = settings.who_can_message === o.value;
                return (
                  <label
                    key={o.value}
                    className={`flex items-start gap-3 rounded-2xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
                      selected ? "border-accent-ink" : "border-line"
                    } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="whoCanMessage"
                      value={o.value}
                      checked={selected}
                      onChange={() => save("who_can_message", o.value)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink"
                    />
                    <span className="flex flex-col gap-1">
                      <span className={`text-sm font-bold ${selected ? "text-accent-ink" : ""}`}>{t(o.label)}</span>
                      {o.hint && <span className="text-xs leading-snug text-muted">{t(o.hint)}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>
    </main>
  );
}
