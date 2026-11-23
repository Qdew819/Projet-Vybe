"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Avatar from "../../../components/Avatar";
import ConfirmDialog from "../../../components/ConfirmDialog";
import FollowButton from "../../../components/FollowButton";
import ProfileBanner from "../../../components/ProfileBanner";
import ProfileStats from "../../../components/ProfileStats";
import ReportDialog, { type ReportReason } from "../../../components/ReportDialog";
import { displayCityLabel } from "../../../lib/cities";
import { followUser, unfollowUser, type FollowStatus } from "../../../lib/follows";
import { useT } from "../../../lib/i18n";
import { initialsOf } from "../../../lib/profile";
import { createClient } from "../../../lib/supabase/client";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

type Confirm = "cancelRequest" | "unfollow" | "block" | null;

// Le nom d'utilisateur n'est connu qu'au moment de la visite : useParams() a besoin
// d'un <Suspense> (seulement autour de cette page) pour que le build fonctionne.
export default function ProfilPublicPage() {
  return (
    <Suspense fallback={<Chargement />}>
      <ProfilPublic />
    </Suspense>
  );
}

function Chargement() {
  const t = useT();
  return <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>;
}

function ProfilPublic() {
  const router = useRouter();
  const t = useT();
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? "").toLowerCase();

  const [state, setState] = useState<"loading" | "notFound" | "ready">("loading");
  const [me, setMe] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [followStatus, setFollowStatus] = useState<FollowStatus>(null);
  const [blocked, setBlocked] = useState(false);
  const [canView, setCanView] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmError, setConfirmError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Abonnés / abonnements et droit de voir le contenu : relus après chaque action
  const refreshCounts = useCallback(async (ownerId: string) => {
    const supabase = createClient();
    const [countsResult, viewResult] = await Promise.all([
      supabase.rpc("get_follow_counts", { uid: ownerId }),
      supabase.rpc("can_view_content", { owner: ownerId }),
    ]);
    if (countsResult.error) {
      console.error(`Lecture des abonnés impossible : ${countsResult.error.message} (code ${countsResult.error.code})`);
    } else {
      // La fonction peut renvoyer un objet ou une ligne dans un tableau
      const row = Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data;
      setCounts({ followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) });
    }
    if (viewResult.error) {
      console.error(`Vérification de l'accès impossible : ${viewResult.error.message} (code ${viewResult.error.code})`);
      setCanView(false);
    } else {
      setCanView(viewResult.data === true);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const myId = data.user.id;
      setMe(myId);

      // Profil introuvable, ou null parce que cette personne nous a bloqué : même message
      const { data: found, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, cover_url")
        .eq("username", username)
        .maybeSingle();
      if (error) console.error(`Lecture du profil impossible : ${error.message} (code ${error.code})`);
      if (error || !found) {
        setState("notFound");
        return;
      }
      // Mon propre profil : il se gère dans les paramètres
      if (found.id === myId) {
        router.replace("/parametres");
        return;
      }
      setProfile(found as Profile);

      const [followResult, blockResult, ageResult, , cityResult] = await Promise.all([
        supabase.from("follows").select("status").eq("follower_id", myId).eq("followed_id", found.id).maybeSingle(),
        supabase.from("blocks").select("blocked_id").eq("blocker_id", myId).eq("blocked_id", found.id).maybeSingle(),
        supabase.rpc("get_age", { uid: found.id }),
        refreshCounts(found.id),
        // Libellé de la ville, ou null si la personne ne l'affiche pas
        supabase.rpc("get_profile_city", { uid: found.id }),
      ]);
      if (cityResult.error) console.error(`Lecture de la ville impossible : ${cityResult.error.message}`);
      else if (typeof cityResult.data === "string" && cityResult.data) setCity(displayCityLabel(cityResult.data));
      if (followResult.error) console.error(`Lecture de l'abonnement impossible : ${followResult.error.message}`);
      setFollowStatus((followResult.data?.status as FollowStatus) ?? null);
      if (blockResult.error) console.error(`Lecture du blocage impossible : ${blockResult.error.message}`);
      setBlocked(!!blockResult.data);
      if (!ageResult.error && typeof ageResult.data === "number") setAge(ageResult.data);
      setState("ready");
    });
  }, [router, username, refreshCounts]);

  async function follow() {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    let status: FollowStatus;
    try {
      // Sans status : la base choisit « pending » (compte privé) ou « accepted », puis on relit la ligne
      status = await followUser(createClient(), me, profile.id);
    } catch (err) {
      console.error("Abonnement impossible :", err);
      setBusy(false);
      setMessage({ kind: "error", text: t("publicProfile.followError") });
      return;
    }
    setFollowStatus(status);
    await refreshCounts(profile.id);
    setBusy(false);
    setMessage({
      kind: "success",
      text: status === "pending" ? t("publicProfile.requestSent") : t("publicProfile.followed"),
    });
  }

  // Annuler une demande ou se désabonner : on supprime ma ligne d'abonnement
  async function removeFollow() {
    if (!profile) return;
    setBusy(true);
    setConfirmError("");
    try {
      await unfollowUser(createClient(), me, profile.id);
    } catch (err) {
      console.error("Désabonnement impossible :", err);
      setBusy(false);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    setFollowStatus(null);
    await refreshCounts(profile.id);
    setBusy(false);
    setConfirm(null);
  }

  async function block() {
    if (!profile) return;
    setBusy(true);
    setConfirmError("");
    const { error } = await createClient().from("blocks").insert({ blocker_id: me, blocked_id: profile.id });
    if (error) {
      console.error(`Blocage impossible : ${error.message} (code ${error.code})`);
      setBusy(false);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    // La base supprime les abonnements dans les deux sens
    setBlocked(true);
    setFollowStatus(null);
    await refreshCounts(profile.id);
    setBusy(false);
    setConfirm(null);
    setReporting(false);
    setMessage(null);
  }

  async function unblock() {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().from("blocks").delete().eq("blocker_id", me).eq("blocked_id", profile.id);
    if (error) {
      console.error(`Déblocage impossible : ${error.message} (code ${error.code})`);
      setBusy(false);
      setMessage({ kind: "error", text: t("publicProfile.actionError") });
      return;
    }
    setBlocked(false);
    await refreshCounts(profile.id);
    setBusy(false);
    setMessage({ kind: "success", text: t("publicProfile.unblocked") });
  }

  async function report(reason: ReportReason, details: string): Promise<string | null> {
    if (!profile) return t("publicProfile.actionError");
    // Pas de .select() : la lecture des signalements est refusée
    const { error } = await createClient()
      .from("reports")
      .insert({ reporter_id: me, reported_id: profile.id, reason, details: details || null });
    if (error) {
      console.error(`Signalement impossible : ${error.message} (code ${error.code})`);
      return t("report.error");
    }
    return null;
  }

  if (state === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  if (state === "notFound" || !profile) {
    return (
      <main className="bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-lg font-semibold">{t("publicProfile.notFound")}</p>
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/accueil"))}
            className="rounded-2xl border-2 border-accent-ink px-6 py-3 text-sm font-bold text-accent-ink"
          >
            {t("common.back")}
          </button>
        </div>
      </main>
    );
  }

  const handle = `@${profile.username}`;
  const name = profile.display_name || profile.username;

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col pb-12">
        <ProfileBanner src={profile.cover_url} backHref="/accueil" />

        <div className="px-6">
          {/* Photo qui chevauche le bas de la bannière, nom à droite */}
          <div className="flex items-start gap-4">
            <div className="-mt-12 shrink-0 rounded-full bg-background p-1">
              <Avatar src={profile.avatar_url} initial={initialsOf(name)} alt={t("publicProfile.avatarAlt").replace("{name}", name)} size={96} neon />
            </div>
            <div className="min-w-0 flex-1 pt-3">
              <h1 className="truncate text-xl font-bold leading-tight">{name}</h1>
              <p className="truncate text-sm text-muted">{handle}</p>
              <p className="mt-0.5 text-sm text-muted">
                {[age !== null ? t("profile.age").replace("{n}", String(age)) : null, city].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {profile.bio && <p className="mt-4 whitespace-pre-line break-words text-sm leading-snug">{profile.bio}</p>}

          <div className="mt-5">
            <ProfileStats followers={counts.followers} following={counts.following} />
          </div>

          {/* Actions : bouton principal (caché si bloqué) et menu « ⋯ » */}
          <div className="mt-5 flex items-center gap-2">
            {!blocked && (
              <FollowButton
                status={followStatus}
                busy={busy}
                name={name}
                onFollow={follow}
                onPending={() => {
                  setConfirmError("");
                  setConfirm("cancelRequest");
                }}
                onAccepted={() => {
                  setConfirmError("");
                  setConfirm("unfollow");
                }}
              />
            )}
            <MoreMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              label={t("publicProfile.more")}
              items={[
                ...(!blocked
                  ? [
                      {
                        label: t("publicProfile.block").replace("{handle}", handle),
                        danger: true,
                        onSelect: () => {
                          setConfirmError("");
                          setConfirm("block");
                        },
                      },
                    ]
                  : []),
                { label: t("publicProfile.report").replace("{handle}", handle), onSelect: () => setReporting(true) },
              ]}
            />
          </div>

          <p aria-live="polite" className={`mt-3 min-h-5 text-sm ${message?.kind === "error" ? "text-danger" : "text-accent-ink"}`}>
            {message?.text ?? ""}
          </p>

          {/* Contenu */}
          <section aria-label={t("publicProfile.contentLabel")} className="mt-4">
            {blocked ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-6 text-center">
                <p className="text-sm font-semibold">{t("publicProfile.youBlocked").replace("{handle}", handle)}</p>
                <button
                  type="button"
                  onClick={unblock}
                  disabled={busy}
                  aria-busy={busy}
                  className="rounded-2xl border-2 border-accent-ink px-6 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60"
                >
                  {busy ? t("common.wait") : t("publicProfile.unblock")}
                </button>
              </div>
            ) : canView ? (
              <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">{t("publicProfile.postsSoon")}</p>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <p className="text-sm">{t("publicProfile.private")}</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === "block"
            ? t("publicProfile.blockConfirmTitle").replace("{handle}", handle)
            : confirm === "unfollow"
              ? t("publicProfile.unfollowConfirmTitle").replace("{handle}", handle)
              : t("publicProfile.cancelRequestConfirmTitle")
        }
        description={confirm === "block" ? t("publicProfile.blockConfirmText") : undefined}
        confirmLabel={
          confirm === "block"
            ? t("publicProfile.blockConfirm")
            : confirm === "unfollow"
              ? t("publicProfile.unfollow")
              : t("publicProfile.cancelRequest")
        }
        danger={confirm === "block" || confirm === "unfollow"}
        busy={busy}
        error={confirmError}
        onConfirm={confirm === "block" ? block : removeFollow}
        onClose={() => setConfirm(null)}
      />

      <ReportDialog
        open={reporting}
        username={handle}
        onSubmit={report}
        onBlock={
          blocked
            ? undefined
            : () => {
                setReporting(false);
                setConfirmError("");
                setConfirm("block");
              }
        }
        onClose={() => setReporting(false)}
      />
    </main>
  );
}

// Menu « ⋯ » accessible : Échap ou clic à l'extérieur le ferme, flèches haut/bas pour se déplacer
function MoreMenu({
  open,
  onOpenChange,
  label,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  items: { label: string; danger?: boolean; onSelect: () => void }[];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

  function onKeyDown(e: React.KeyboardEvent) {
    const index = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      itemRefs.current[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemRefs.current[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      onOpenChange(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-line bg-surface text-xl font-black leading-none hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-xl">
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(false);
                item.onSelect();
              }}
              className={`block w-full px-4 py-3 text-left text-sm font-semibold hover:bg-background focus:bg-background focus:outline-none ${
                item.danger ? "text-danger" : "text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
