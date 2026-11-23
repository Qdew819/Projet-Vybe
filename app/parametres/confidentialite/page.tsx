"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import Avatar from "../../../components/Avatar";
import { useT } from "../../../lib/i18n";
import { initialsOf } from "../../../lib/profile";
import { createClient } from "../../../lib/supabase/client";

type Person = { id: string; username: string | null; displayName: string | null; avatarUrl: string | null };
type RowAction = { label: string; onClick: () => void; variant: "primary" | "secondary" };

// follows et blocks ne sont pas liés à profiles : on lit les profils à part, avec la liste des identifiants
async function loadPeople(supabase: SupabaseClient, ids: string[]): Promise<Person[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
  // On garde l'ordre des identifiants ; un profil illisible reste dans la liste (on peut quand même agir dessus)
  return ids.map((id) => {
    const p = byId.get(id);
    return {
      id,
      username: (p?.username as string | undefined) ?? null,
      displayName: (p?.display_name as string | undefined) ?? null,
      avatarUrl: (p?.avatar_url as string | undefined) ?? null,
    };
  });
}

export default function Confidentialite() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState("");
  const [requests, setRequests] = useState<Person[]>([]);
  const [blockedPeople, setBlockedPeople] = useState<Person[]>([]);
  const [requestsError, setRequestsError] = useState(false);
  const [blockedError, setBlockedError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null); // ex. « accept:<id> » : bouton en cours
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const myId = data.user.id;
      setMe(myId);

      const [followsResult, blocksResult] = await Promise.all([
        supabase
          .from("follows")
          .select("follower_id, created_at")
          .eq("followed_id", myId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase.from("blocks").select("blocked_id, created_at").eq("blocker_id", myId).order("created_at", { ascending: false }),
      ]);

      try {
        if (followsResult.error) throw followsResult.error;
        setRequests(await loadPeople(supabase, (followsResult.data ?? []).map((r) => r.follower_id as string)));
      } catch (err) {
        console.error("Lecture des demandes d'abonnement impossible :", err);
        setRequestsError(true);
      }
      try {
        if (blocksResult.error) throw blocksResult.error;
        setBlockedPeople(await loadPeople(supabase, (blocksResult.data ?? []).map((r) => r.blocked_id as string)));
      } catch (err) {
        console.error("Lecture des personnes bloquées impossible :", err);
        setBlockedError(true);
      }
      setReady(true);
    });
  }, [router]);

  function handleOf(person: Person) {
    return person.username ? `@${person.username}` : t("privacy.unknownUser");
  }

  // Lance une action sur une ligne, puis la retire de la liste si elle réussit
  async function run(key: string, action: () => PromiseLike<{ error: { message: string; code?: string } | null }>, onDone: () => void, success: string) {
    setBusyKey(key);
    setMessage(null);
    const { error } = await action();
    setBusyKey(null);
    if (error) {
      console.error(`Action impossible : ${error.message} (code ${error.code})`);
      setMessage({ kind: "error", text: t("privacy.actionError") });
      return;
    }
    onDone();
    setMessage({ kind: "success", text: success });
  }

  function accept(person: Person) {
    run(
      `accept:${person.id}`,
      () => createClient().from("follows").update({ status: "accepted" }).eq("follower_id", person.id).eq("followed_id", me),
      () => setRequests((list) => list.filter((p) => p.id !== person.id)),
      t("privacy.accepted").replace("{handle}", handleOf(person))
    );
  }

  function refuse(person: Person) {
    run(
      `refuse:${person.id}`,
      () => createClient().from("follows").delete().eq("follower_id", person.id).eq("followed_id", me),
      () => setRequests((list) => list.filter((p) => p.id !== person.id)),
      t("privacy.refused").replace("{handle}", handleOf(person))
    );
  }

  function unblock(person: Person) {
    run(
      `unblock:${person.id}`,
      () => createClient().from("blocks").delete().eq("blocker_id", me).eq("blocked_id", person.id),
      () => setBlockedPeople((list) => list.filter((p) => p.id !== person.id)),
      t("privacy.unblocked").replace("{handle}", handleOf(person))
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-6 pb-12 pt-8">
        <Link href="/parametres" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("privacy.title")}</h1>

        <p aria-live="polite" className={`mt-4 min-h-5 text-sm ${message?.kind === "error" ? "text-danger" : "text-accent-ink"}`}>
          {message?.text ?? ""}
        </p>

        <section aria-labelledby="titre-demandes" className="mt-6">
          <h2 id="titre-demandes" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("privacy.requests")} {requests.length > 0 && `(${requests.length})`}
          </h2>
          {requestsError ? (
            <p className="text-sm text-danger">{t("privacy.loadError")}</p>
          ) : requests.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{t("privacy.noRequests")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {requests.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  handle={handleOf(person)}
                  busyKey={busyKey}
                  actions={[
                    { label: t("privacy.accept"), onClick: () => accept(person), variant: "primary" },
                    { label: t("privacy.refuse"), onClick: () => refuse(person), variant: "secondary" },
                  ]}
                  actionKeys={[`accept:${person.id}`, `refuse:${person.id}`]}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-bloques" className="mt-10">
          <h2 id="titre-bloques" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("privacy.blocked")}
          </h2>
          {blockedError ? (
            <p className="text-sm text-danger">{t("privacy.loadError")}</p>
          ) : blockedPeople.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{t("privacy.noBlocked")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {blockedPeople.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  handle={handleOf(person)}
                  busyKey={busyKey}
                  actions={[{ label: t("publicProfile.unblock"), onClick: () => unblock(person), variant: "secondary" }]}
                  actionKeys={[`unblock:${person.id}`]}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// Une personne : photo ronde (initiales sinon), nom, @, et ses boutons
function PersonRow({
  person,
  handle,
  busyKey,
  actions,
  actionKeys,
}: {
  person: Person;
  handle: string;
  busyKey: string | null;
  actions: RowAction[];
  actionKeys: string[];
}) {
  const t = useT();
  const name = person.displayName || person.username || handle;
  const anyBusy = actionKeys.includes(busyKey ?? "");
  const identity = (
    <>
      <Avatar src={person.avatarUrl} initial={initialsOf(name)} alt="" size={48} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold">{name}</span>
        <span className="truncate text-xs text-muted">{handle}</span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      {person.username ? (
        <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
          {identity}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{identity}</span>
      )}
      <div className="flex shrink-0 gap-2">
        {actions.map((action, i) => {
          const busy = busyKey === actionKeys[i];
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={anyBusy}
              aria-busy={busy}
              aria-label={`${action.label} ${handle}`}
              className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 ${
                action.variant === "primary" ? "bg-accent text-on-accent" : "border-2 border-line text-foreground hover:border-accent-ink"
              }`}
            >
              {busy ? t("common.wait") : action.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}
