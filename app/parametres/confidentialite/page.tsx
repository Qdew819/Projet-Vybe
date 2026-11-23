"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PersonRow, { RowButton } from "../../../components/PersonRow";
import { loadPeople, personName, type Person } from "../../../lib/follows";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

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
  async function run(
    key: string,
    action: () => PromiseLike<{ error: { message: string; code?: string } | null }>,
    onDone: () => void,
    success: string
  ) {
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
              {requests.map((person) => {
                const name = personName(person, handleOf(person));
                const rowBusy = busyKey === `accept:${person.id}` || busyKey === `refuse:${person.id}`;
                return (
                  <PersonRow
                    key={person.id}
                    person={person}
                    actions={
                      <>
                        <RowButton
                          label={t("privacy.accept")}
                          ariaLabel={t("people.acceptLabel").replace("{name}", name)}
                          busy={busyKey === `accept:${person.id}`}
                          disabled={rowBusy}
                          variant="primary"
                          onClick={() => accept(person)}
                        />
                        <RowButton
                          label={t("privacy.refuse")}
                          ariaLabel={t("people.refuseLabel").replace("{name}", name)}
                          busy={busyKey === `refuse:${person.id}`}
                          disabled={rowBusy}
                          variant="secondary"
                          onClick={() => refuse(person)}
                        />
                      </>
                    }
                  />
                );
              })}
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
                  actions={
                    <RowButton
                      label={t("publicProfile.unblock")}
                      ariaLabel={t("people.unblockLabel").replace("{name}", personName(person, handleOf(person)))}
                      busy={busyKey === `unblock:${person.id}`}
                      variant="secondary"
                      onClick={() => unblock(person)}
                    />
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
