"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import Avatar from "../../components/Avatar";
import ProfileBanner from "../../components/ProfileBanner";
import ProfileStats from "../../components/ProfileStats";
import ProfileTabs from "../../components/ProfileTabs";
import ProfilePublications from "../../components/profile/ProfilePublications";
import { fetchPostCount } from "../../lib/posts";
import { useShare } from "../../components/ShareButton";
import SportsTabs from "../../components/SportsTabs";
import { displayCityLabel } from "../../lib/cities";
import { useT } from "../../lib/i18n";
import { profileSharePath } from "../../lib/share";
import { createClient } from "../../lib/supabase/client";
import { fetchCatalog, loadMySports, withDetails, type UserSport } from "../../lib/userSports";

type MyProfile = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
};

// Mon profil, tel que les autres le voient (en lecture seule). Les modifications se font dans /parametres.
export default function Profil() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [myId, setMyId] = useState("");
  const [postCount, setPostCount] = useState(0);
  const [sports, setSports] = useState<UserSport[]>([]);
  const [activeSport, setActiveSport] = useState<number | null>(null);
  // Partage du profil (feuille de partage du téléphone ou « Envoyer à… »)
  const { share, ui: shareUi } = useShare();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setMyId(uid);
      void fetchPostCount(supabase, uid).then(setPostCount);
      const { data: row, error } = await supabase
        .from("profiles")
        .select("username, display_name, bio, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (error) {
        console.error(`Lecture du profil impossible : ${error.message} (code ${error.code})`);
        setLoadFailed(true);
        setReady(true);
        return;
      }
      // Pas encore de profil : on le crée d'abord
      if (!row) {
        router.replace("/profil/creer");
        return;
      }

      // Lus à part : si l'un manque, le reste du profil s'affiche quand même
      const [coverResult, ageResult, cityResult, countsResult, sportsResult] = await Promise.all([
        supabase.from("profiles").select("cover_url").eq("id", uid).maybeSingle(),
        supabase.rpc("get_age", { uid }),
        supabase.rpc("get_profile_city", { uid }),
        supabase.rpc("get_follow_counts", { uid }),
        Promise.all([loadMySports(supabase, uid), fetchCatalog(supabase)]).then(
          ([choices, catalog]) => ({ data: withDetails(choices, catalog), error: null }),
          (err: unknown) => ({ data: null, error: err })
        ),
      ]);

      let coverUrl: string | null = null;
      if (coverResult.error) {
        console.error(`Lecture de la photo de fond impossible : ${coverResult.error.message} (code ${coverResult.error.code})`);
      } else if (typeof coverResult.data?.cover_url === "string" && coverResult.data.cover_url) {
        coverUrl = coverResult.data.cover_url;
      }
      if (ageResult.error) {
        console.error(`Calcul de l'âge impossible : ${ageResult.error.message} (code ${ageResult.error.code})`);
      } else if (typeof ageResult.data === "number") {
        setAge(ageResult.data);
      }
      if (cityResult.error) {
        console.error(`Lecture de la ville impossible : ${cityResult.error.message} (code ${cityResult.error.code})`);
      } else if (typeof cityResult.data === "string" && cityResult.data) {
        setCity(displayCityLabel(cityResult.data));
      }
      if (countsResult.error) {
        console.error(`Lecture des abonnés impossible : ${countsResult.error.message} (code ${countsResult.error.code})`);
      } else {
        const counts = Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data;
        setCounts({ followers: Number(counts?.followers ?? 0), following: Number(counts?.following ?? 0) });
      }
      if (sportsResult.error || !sportsResult.data) {
        console.error("Lecture des sports impossible :", sportsResult.error);
      } else {
        setSports(sportsResult.data);
        setActiveSport(sportsResult.data[0]?.sport.id ?? null);
      }

      setProfile({
        username: typeof row.username === "string" ? row.username : "",
        displayName: typeof row.display_name === "string" ? row.display_name : "",
        bio: typeof row.bio === "string" ? row.bio : "",
        avatarUrl: typeof row.avatar_url === "string" && row.avatar_url ? row.avatar_url : null,
        coverUrl,
      });
      setReady(true);
    });
  }, [router]);


  // Copie le lien de mon profil public ; le message est annoncé (aria-live) puis disparaît
  // Partage du profil : feuille de partage du téléphone, sinon « Envoyer à… » (lien /u/<pseudo>)
  function shareProfile() {
    if (!profile?.username) return;
    const display = profile.displayName || profile.username;
    void share({
      url: profileSharePath(profile.username),
      title: `${display} (@${profile.username}) · Vybe`,
      text: t("share.profileText").replace("{name}", display),
    });
  }

  if (!ready) {
    return (
      <AppShell active="profil">
        <h1 className="sr-only">{t("myProfile.title")}</h1>
        <div role="status" className="flex flex-1 items-center justify-center text-muted">
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  if (loadFailed || !profile) {
    return (
      <AppShell active="profil">
        <h1 className="sr-only">{t("myProfile.title")}</h1>
        <p role="alert" className="flex flex-1 items-center justify-center px-6 text-center text-sm text-danger">
          {t("myProfile.loadError")}
        </p>
      </AppShell>
    );
  }

  const name = profile.displayName || profile.username;
  const details = [age !== null ? t("profile.age").replace("{n}", String(age)) : null, city].filter(Boolean).join(" · ");

  return (
    <AppShell active="profil">
      <h1 className="sr-only">{t("myProfile.title")}</h1>

      {/* Photo de fond : partage et engrenage (paramètres) en haut à droite */}
      <ProfileBanner
        src={profile.coverUrl}
        settingsHref="/parametres"
        settingsLabel={t("home.settings")}
        onShare={profile.username ? shareProfile : undefined}
        shareLabel={t("share.profile")}
      />

      <div className="px-6">
        {/* Photo de profil qui chevauche le bas de la bannière, nom à droite, bouton tout à droite */}
        <div className="flex items-start gap-4">
          <div className="-mt-12 shrink-0 rounded-full bg-background p-1">
            <Avatar src={profile.avatarUrl} initial={(name || "?").charAt(0).toUpperCase()} alt={t("settings.avatarAlt")} size={96} neon />
          </div>

          <div className="min-w-0 flex-1 pt-3">
            <p className="truncate text-xl font-bold leading-tight">{name}</p>
            {profile.username && <p className="truncate text-sm text-muted">@{profile.username}</p>}
            {details && <p className="mt-0.5 text-sm text-muted">{details}</p>}
          </div>

          <Link
            href="/parametres"
            className="mt-3 flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-accent-ink px-3 text-xs font-bold leading-tight text-accent-ink transition-colors hover:bg-accent-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            {t("myProfile.edit")}
          </Link>
        </div>


        {profile.bio && <p className="mt-4 whitespace-pre-line break-words text-sm leading-snug">{profile.bio}</p>}

        {/* Publications : posts + vidéos */}
        <div className="mt-5">
          <ProfileStats posts={postCount} followers={counts.followers} following={counts.following} />
        </div>

        {sports.length > 0 && (
          <div className="mt-5">
            <SportsTabs sports={sports} activeId={activeSport} onSelect={setActiveSport} editHref="/parametres/sports" />
          </div>
        )}
      </div>

      <div className="mt-6">
        <ProfileTabs publications={myId ? <ProfilePublications authorId={myId} username={profile.username || null} mine /> : undefined} />
      </div>
      {shareUi}
    </AppShell>
  );
}
