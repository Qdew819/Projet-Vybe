"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "../../../components/ConfirmDialog";
import LocationPicker from "../../../components/LocationPicker";
import Switch from "../../../components/Switch";
import type { CityValue } from "../../../lib/cities";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

type Saved = { cityId: number; showOnProfile: boolean } | null;

export default function Localisation() {
  const router = useRouter();
  const t = useT();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Ligne enregistrée (null s'il n'y en a pas), pour savoir si quelque chose a changé
  const [saved, setSaved] = useState<Saved>(null);
  const [city, setCity] = useState<CityValue | null>(null);
  const [showOnProfile, setShowOnProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "removed" | "error">("idle");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
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

      const [locationResult, ageResult] = await Promise.all([
        supabase.from("user_locations").select("city_id, show_on_profile").eq("user_id", uid).maybeSingle(),
        supabase.rpc("get_age", { uid }),
      ]);
      if (locationResult.error) {
        console.error(`Lecture de la ville impossible : ${locationResult.error.message} (code ${locationResult.error.code})`);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      const row = locationResult.data;
      if (row && typeof row.city_id === "number") {
        // Deuxième requête pour le libellé et le pays de la ville
        const { data: cityRow, error: cityError } = await supabase
          .from("cities")
          .select("label, country_code")
          .eq("id", row.city_id)
          .maybeSingle();
        if (cityError || !cityRow) {
          if (cityError) console.error(`Lecture de la ville impossible : ${cityError.message} (code ${cityError.code})`);
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        const show = row.show_on_profile === true;
        setSaved({ cityId: row.city_id, showOnProfile: show });
        setCity({ cityId: row.city_id, label: String(cityRow.label), countryCode: String(cityRow.country_code) });
        setShowOnProfile(show);
      } else if (!ageResult.error && typeof ageResult.data === "number") {
        // Pas encore de ville : même valeur par défaut qu'à l'inscription
        setShowOnProfile(ageResult.data >= 18);
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  function clearStatus() {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setStatus("idle");
  }

  async function save() {
    if (!city || !userId) return;
    clearStatus();
    setSaving(true);
    const { error } = await createClient()
      .from("user_locations")
      .upsert({ user_id: userId, city_id: city.cityId, show_on_profile: showOnProfile }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      console.error(`Enregistrement de la ville impossible : ${error.message} (code ${error.code})`);
      setStatus("error");
      return;
    }
    setSaved({ cityId: city.cityId, showOnProfile });
    setStatus("saved");
    savedTimer.current = setTimeout(() => setStatus("idle"), 3000);
  }

  async function remove() {
    if (!userId) return;
    setRemoving(true);
    setRemoveError("");
    const { error } = await createClient().from("user_locations").delete().eq("user_id", userId);
    setRemoving(false);
    if (error) {
      console.error(`Suppression de la ville impossible : ${error.message} (code ${error.code})`);
      setRemoveError(t("location.removeError"));
      return;
    }
    setSaved(null);
    setCity(null);
    setConfirmRemove(false);
    clearStatus();
    setStatus("removed");
  }

  const unchanged = saved !== null && city?.cityId === saved.cityId && showOnProfile === saved.showOnProfile;
  const disabled = loading || loadFailed;

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-6 pb-12 pt-8">
        <Link href="/parametres" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("location.title")}</h1>

        <p aria-live="polite" className="mt-4 min-h-5 text-sm">
          {loading && <span className="text-muted">{t("common.loading")}</span>}
          {loadFailed && <span className="text-danger">{t("location.loadError")}</span>}
          {status === "error" && <span className="text-danger">{t("location.saveError")}</span>}
          {status === "saved" && <span className="font-semibold text-accent-ink">{t("location.saved")}</span>}
          {status === "removed" && <span className="font-semibold text-accent-ink">{t("location.removed")}</span>}
        </p>

        {!disabled && (
          <>
            <div className="mt-6">
              {/* La clé recrée le choix (pays présélectionné) après un retrait */}
              <LocationPicker
                key={saved ? "avec-ville" : "sans-ville"}
                value={city}
                onChange={(value) => {
                  setCity(value);
                  clearStatus();
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
                  setShowOnProfile(checked);
                  clearStatus();
                }}
              />
            </div>

            <div className="mt-10 flex flex-col gap-3">
              <button
                type="button"
                onClick={save}
                disabled={!city || saving || unchanged}
                aria-busy={saving}
                className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
              >
                {saving ? t("common.saving") : t("settings.save")}
              </button>
              {saved && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveError("");
                    setConfirmRemove(true);
                  }}
                  disabled={saving}
                  aria-haspopup="dialog"
                  className="w-full rounded-2xl border-2 border-danger py-3 text-sm font-bold text-danger disabled:opacity-60"
                >
                  {t("location.remove")}
                </button>
              )}
            </div>
          </>
        )}

        <p className="mt-auto pt-12 text-xs text-muted">{t("location.credit")}</p>

        <ConfirmDialog
          open={confirmRemove}
          title={t("location.removeTitle")}
          description={t("location.removeText")}
          confirmLabel={t("location.removeConfirm")}
          danger
          busy={removing}
          error={removeError}
          onConfirm={remove}
          onClose={() => setConfirmRemove(false)}
        />
      </div>
    </main>
  );
}
