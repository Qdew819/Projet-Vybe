"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AccountTypePicker, { type AccountType } from "../../components/AccountTypePicker";
import AvatarPicker from "../../components/AvatarPicker";
import ProfileBanner from "../../components/ProfileBanner";
import ProfileStats from "../../components/ProfileStats";
import SportsDialog from "../../components/SportsDialog";
import SportsTabs from "../../components/SportsTabs";
import UsernameDialog from "../../components/UsernameDialog";
import { COVER_MAX_BYTES, isAcceptedCover, resizeCover, uploadCover } from "../../lib/cover";
import { useT } from "../../lib/i18n";
import { BIO_MAX, UNIQUE_VIOLATION } from "../../lib/profile";
import { createClient } from "../../lib/supabase/client";
import { useAvatarChoice } from "../../lib/useAvatarChoice";

export default function Parametres() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  // Valeurs enregistrées dans la base, pour savoir si quelque chose a changé
  const [savedType, setSavedType] = useState<AccountType>("public");
  const [savedBio, setSavedBio] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [editingSports, setEditingSports] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("public");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Photo de fond : adresse enregistrée, aperçu pendant l'envoi, état et message
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverMessage, setCoverMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const avatar = useAvatarChoice(savedAvatar, (key) => {
    setSuccess(false);
    setError(t(key));
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username, display_name, is_private, bio, avatar_url")
        .eq("id", uid)
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
      const currentType: AccountType = profile.is_private ? "private" : "public";
      const currentBio = typeof profile.bio === "string" ? profile.bio : "";
      const currentUsername = typeof profile.username === "string" ? profile.username : "";
      setUserId(uid);
      setSavedUsername(currentUsername);
      setDisplayName(typeof profile.display_name === "string" ? profile.display_name : "");
      setSavedType(currentType);
      setAccountType(currentType);
      setSavedBio(currentBio);
      setBio(currentBio);
      setSavedAvatar(typeof profile.avatar_url === "string" && profile.avatar_url ? profile.avatar_url : null);

      // Sports, photo de fond et âge lus à part : si l'un manque, le reste de la page fonctionne quand même
      const [sportsResult, coverResult, ageResult] = await Promise.all([
        supabase.from("profiles").select("sports").eq("id", uid).maybeSingle(),
        supabase.from("profiles").select("cover_url").eq("id", uid).maybeSingle(),
        supabase.rpc("get_age", { uid }),
      ]);
      if (sportsResult.error) {
        console.error(`Lecture des sports impossible : ${sportsResult.error.message} (code ${sportsResult.error.code})`);
      } else if (Array.isArray(sportsResult.data?.sports)) {
        const ids = sportsResult.data.sports.filter((id: unknown): id is string => typeof id === "string");
        setSports(ids);
        setActiveSport(ids[0] ?? null);
      }
      if (coverResult.error) {
        console.error(`Lecture de la photo de fond impossible : ${coverResult.error.message} (code ${coverResult.error.code})`);
      } else if (typeof coverResult.data?.cover_url === "string" && coverResult.data.cover_url) {
        setCoverUrl(coverResult.data.cover_url);
      }
      if (ageResult.error) {
        console.error(`Calcul de l'âge impossible : ${ageResult.error.message} (code ${ageResult.error.code})`);
      } else if (typeof ageResult.data === "number") {
        setAge(ageResult.data);
      }
      setReady(true);
    });
  }, [router]);

  // Libère l'aperçu local de la photo de fond quand il est remplacé ou quand on quitte la page
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  // Photo de fond : recadrée en 3:1, envoyée et enregistrée tout de suite (aperçu immédiat)
  async function pickCover(file: File) {
    setCoverMessage(null);
    if (!isAcceptedCover(file)) {
      setCoverMessage({ kind: "error", text: t("cover.typeError") });
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setCoverMessage({ kind: "error", text: t("cover.sizeError") });
      return;
    }
    setCoverUploading(true);
    let blob: Blob;
    try {
      blob = await resizeCover(file);
    } catch (err) {
      console.error("Préparation de la photo de fond impossible :", err);
      setCoverUploading(false);
      setCoverMessage({ kind: "error", text: t("cover.readError") });
      return;
    }
    setCoverPreview(URL.createObjectURL(blob));

    const supabase = createClient();
    try {
      const url = await uploadCover(supabase, userId, blob);
      const { error } = await supabase.from("profiles").update({ cover_url: url }).eq("id", userId);
      if (error) throw error;
      setCoverUrl(url);
      setCoverMessage({ kind: "success", text: t("cover.saved") });
    } catch (err) {
      console.error("Enregistrement de la photo de fond impossible :", err);
      setCoverMessage({ kind: "error", text: t("cover.uploadError") });
    } finally {
      // L'aperçu disparaît : on affiche la photo enregistrée (ou l'ancienne en cas d'erreur)
      setCoverPreview(null);
      setCoverUploading(false);
    }
  }

  // Fenêtre « Tes sports » : les sports sont enregistrés tout de suite.
  // Renvoie le message d'erreur à afficher dans la fenêtre, ou null si c'est bon.
  async function saveSports(newSports: string[]): Promise<string | null> {
    const { error } = await createClient().from("profiles").update({ sports: newSports }).eq("id", userId);
    if (error) {
      console.error(`Enregistrement des sports impossible : ${error.message} (code ${error.code})`);
      return t("sports.saveError");
    }
    setSports(newSports);
    // L'onglet actif reste le même s'il est toujours choisi, sinon on passe au premier sport
    setActiveSport((current) => (current && newSports.includes(current) ? current : (newSports[0] ?? null)));
    return null;
  }

  // Dès qu'on modifie quelque chose, on efface l'ancien message
  function clearMessages() {
    setSuccess(false);
    setError("");
  }

  function chooseType(choice: AccountType) {
    setAccountType(choice);
    clearMessages();
  }

  // Fenêtre « Modifier nom profil » : le nom est enregistré tout de suite.
  // Renvoie le message d'erreur à afficher dans la fenêtre, ou null si c'est bon.
  async function saveUsername(newUsername: string): Promise<string | null> {
    if (newUsername === savedUsername) return null;
    const { error } = await createClient().from("profiles").update({ username: newUsername }).eq("id", userId);
    if (error) {
      console.error(`Enregistrement du nom d'utilisateur impossible : ${error.message} (code ${error.code})`);
      return error.code === UNIQUE_VIOLATION ? t("profile.errorUsernameTaken") : t("settings.saveError");
    }
    setSavedUsername(newUsername);
    setError("");
    setSuccess(true);
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessages();
    setSaving(true);
    const supabase = createClient();

    // 1. Une nouvelle photo de profil est envoyée d'abord, pour connaître son adresse
    let avatarUrl: string | null;
    try {
      avatarUrl = await avatar.upload(supabase, userId);
    } catch (err) {
      console.error("Envoi de la photo impossible :", err);
      setSaving(false);
      setError(t("settings.avatarUploadError"));
      return;
    }

    // 2. Puis le profil
    const newBio = bio.trim();
    const { error } = await supabase
      .from("profiles")
      .update({ is_private: accountType === "private", bio: newBio || null, avatar_url: avatarUrl })
      .eq("id", userId);
    if (error) {
      setSaving(false);
      console.error(`Enregistrement des paramètres impossible : ${error.message} (code ${error.code})`);
      setError(t("settings.saveError"));
      return;
    }

    // 3. L'ancienne photo envoyée est supprimée si elle n'est plus utilisée
    await avatar.cleanUp(supabase, userId, avatarUrl);

    setSaving(false);
    setSavedAvatar(avatarUrl);
    setSavedType(accountType);
    setSavedBio(newBio);
    setBio(newBio);
    setSuccess(true);
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  const unchanged = accountType === savedType && bio.trim() === savedBio && !avatar.changed;

  return (
    <main className="bg-background text-foreground">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col pb-10">
        <h1 className="sr-only">{t("settings.title")}</h1>

        {/* Bannière : photo de fond, « Retour », réglages et bouton appareil photo */}
        <ProfileBanner
          src={coverPreview ?? coverUrl}
          busy={coverUploading}
          disabled={!userId}
          onPick={pickCover}
          backHref="/accueil"
          settingsHref="#reglages"
        />

        {userId && (
          <div className="px-6">
            {/* Photo de profil qui chevauche le bas de la bannière, nom à droite, bouton tout à droite */}
            <div className="flex items-start gap-4">
              <div className="-mt-12 shrink-0 rounded-full bg-background p-1">
                <AvatarPicker
                  size={96}
                  neon
                  src={avatar.src}
                  initial={(savedUsername || "?").charAt(0).toUpperCase()}
                  busy={avatar.preparing || saving}
                  onPickPhoto={(photo) => {
                    clearMessages();
                    avatar.pickPhoto(photo);
                  }}
                  onPickPreset={(src) => {
                    clearMessages();
                    avatar.pickPreset(src);
                  }}
                  onRemove={() => {
                    clearMessages();
                    avatar.remove();
                  }}
                />
              </div>

              <div className="min-w-0 flex-1 pt-3">
                <p className="truncate text-xl font-bold leading-tight">{displayName || savedUsername}</p>
                <p className="truncate text-sm text-muted">@{savedUsername}</p>
                {/* Âge, puis la ville plus tard (même ligne, séparée par « · ») */}
                <p className="mt-0.5 text-sm text-muted">
                  {age !== null && <span>{t("profile.age").replace("{n}", String(age))}</span>}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setEditingUsername(true);
                }}
                aria-haspopup="dialog"
                className="mt-3 flex max-w-30 shrink-0 items-center gap-1.5 rounded-xl border-2 border-accent-ink px-2.5 py-1.5 text-left text-xs font-bold leading-tight text-accent-ink transition-colors hover:bg-accent-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                {t("profile.editUsername")}
              </button>
            </div>

            {(coverUploading || coverMessage) && (
              <p aria-live="polite" className={`mt-3 text-sm ${coverMessage?.kind === "error" ? "text-danger" : "text-accent-ink"}`}>
                {coverUploading ? t("cover.uploading") : coverMessage?.text}
              </p>
            )}

            {/* Bio enregistrée : elle change ici après « Enregistrer » */}
            {savedBio && <p className="mt-4 whitespace-pre-line break-words text-sm leading-snug">{savedBio}</p>}

            {/* Pas encore de publications ni d'abonnements dans la base : 0 en attendant */}
            <div className="mt-5">
              <ProfileStats posts={0} followers={0} following={0} />
            </div>

            <div className="mt-5">
              <SportsTabs
                sportIds={sports}
                activeId={activeSport}
                onSelect={setActiveSport}
                onEdit={() => {
                  clearMessages();
                  setEditingSports(true);
                }}
              />
            </div>

            <UsernameDialog
              open={editingUsername}
              value={savedUsername}
              confirmLabel={t("settings.save")}
              onConfirm={saveUsername}
              onClose={() => setEditingUsername(false)}
            />
            <SportsDialog
              open={editingSports}
              value={sports}
              onConfirm={saveSports}
              onClose={() => setEditingSports(false)}
            />

            {/* Réglages modifiables, même style qu'avant ; l'icône de réglages de la bannière mène ici */}
            <section id="reglages" aria-labelledby="titre-reglages" className="mt-10 scroll-mt-6">
              <h2 id="titre-reglages" className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
                {t("settings.editSection")}
              </h2>

              <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold">
                {t("profile.bio")}
              </label>
              <textarea
                id="bio"
                rows={4}
                maxLength={BIO_MAX}
                placeholder={t("profile.bioPlaceholder")}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  clearMessages();
                }}
                aria-describedby="bio-count"
                className="w-full resize-none rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
              />
              <p id="bio-count" className="mt-1.5 text-right text-xs text-muted">
                {bio.length}/{BIO_MAX}
              </p>

              <div className="mt-6">
                <AccountTypePicker value={accountType} onChange={chooseType} />
              </div>
            </section>
          </div>
        )}

        <p aria-live="polite" className="mt-6 px-6 text-sm">
          {loadFailed && <span className="text-danger">{t("settings.loadError")}</span>}
          {error && <span className="text-danger">{error}</span>}
          {success && <span className="text-accent-ink">{t("settings.saved")}</span>}
        </p>

        {userId && (
          <div className="mt-auto px-6 pt-10">
            <button
              type="submit"
              disabled={saving || avatar.preparing || unchanged}
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
