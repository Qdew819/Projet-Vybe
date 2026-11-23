"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "../../components/ConfirmDialog";
import FollowButton from "../../components/FollowButton";
import PersonRow, { RowButton } from "../../components/PersonRow";
import {
  PERSON_COLUMNS,
  escapeLike,
  followUser,
  loadMyStatuses,
  loadPeople,
  personName,
  toPerson,
  unfollowUser,
  type FollowStatus,
  type Person,
} from "../../lib/follows";
import { useLanguage, useT } from "../../lib/i18n";
import { createClient } from "../../lib/supabase/client";
import { relativeTime } from "../../lib/time";

const SEARCH_DELAY = 350; // ms d'attente après la frappe
const SEARCH_MIN = 2; // caractères minimum
const SEARCH_LIMIT = 20;

type SearchState = "hint" | "loading" | "done" | "error";
type Follower = { person: Person; createdAt: string };
type Confirm = { kind: "cancelRequest" | "unfollow"; person: Person } | null;

export default function Personnes() {
  const router = useRouter();
  const t = useT();
  const language = useLanguage();
  const [me, setMe] = useState("");
  const [ready, setReady] = useState(false);

  // Mon statut d'abonnement avec chaque personne affichée (recherche et nouveaux abonnés)
  const [statuses, setStatuses] = useState<Map<string, FollowStatus>>(new Map());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // a) Recherche
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("hint");
  const [results, setResults] = useState<Person[]>([]);
  const [searchedText, setSearchedText] = useState("");
  const blockedIds = useRef<Set<string>>(new Set());
  const searchId = useRef(0); // numéro de la dernière recherche partie

  // b) Demandes d'abonnement et c) nouveaux abonnés
  const [requests, setRequests] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [listsError, setListsError] = useState(false);

  const mergeStatuses = useCallback((incoming: Map<string, FollowStatus>, ids: string[]) => {
    setStatuses((current) => {
      const next = new Map(current);
      for (const id of ids) next.set(id, incoming.get(id) ?? null);
      return next;
    });
  }, []);

  // Recharge les demandes en attente et les 20 derniers abonnés (avec mon statut envers chacun)
  const loadLists = useCallback(
    async (myId: string) => {
      const supabase = createClient();
      try {
        const [pendingResult, acceptedResult] = await Promise.all([
          supabase
            .from("follows")
            .select("follower_id, created_at")
            .eq("followed_id", myId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("follows")
            .select("follower_id, created_at")
            .eq("followed_id", myId)
            .eq("status", "accepted")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        if (pendingResult.error) throw pendingResult.error;
        if (acceptedResult.error) throw acceptedResult.error;

        const accepted = acceptedResult.data ?? [];
        const followerIds = accepted.map((row) => row.follower_id as string);
        const [pendingPeople, followerPeople, myStatuses] = await Promise.all([
          loadPeople(supabase, (pendingResult.data ?? []).map((row) => row.follower_id as string)),
          loadPeople(supabase, followerIds),
          loadMyStatuses(supabase, myId, followerIds),
        ]);
        setRequests(pendingPeople);
        setFollowers(followerPeople.map((person, i) => ({ person, createdAt: accepted[i].created_at as string })));
        mergeStatuses(myStatuses, followerIds);
        setListsError(false);
      } catch (err) {
        console.error("Lecture des demandes et des abonnés impossible :", err);
        setListsError(true);
      }
    },
    [mergeStatuses]
  );

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const myId = data.user.id;
      setMe(myId);
      // Personnes que j'ai bloquées : lues une fois, retirées des résultats de recherche
      const { data: blocks, error } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", myId);
      if (error) console.error(`Lecture des blocages impossible : ${error.message} (code ${error.code})`);
      blockedIds.current = new Set((blocks ?? []).map((row) => row.blocked_id as string));
      await loadLists(myId);
      setReady(true);
    });
  }, [router, loadLists]);

  // Retour sur l'onglet : on recharge les demandes et les abonnés
  useEffect(() => {
    if (!me) return;
    const onFocus = () => loadLists(me);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [me, loadLists]);

  // Recherche : 350 ms après la frappe, 2 caractères minimum (sans le « @ » du début)
  const searchText = query.trim().replace(/^@/, "");
  const tooShort = searchText.length < SEARCH_MIN;

  useEffect(() => {
    if (!me) return;
    const text = searchText;
    if (text.length < SEARCH_MIN) {
      searchId.current += 1; // les réponses en route sont ignorées (l'affichage passe au message d'aide)
      return;
    }
    const timer = setTimeout(async () => {
      const id = ++searchId.current;
      setSearchState("loading");
      const supabase = createClient();
      const pattern = `%${escapeLike(text)}%`;
      try {
        // Deux requêtes séparées (pas de .or()), fusionnées sans doublons
        const [byUsername, byName] = await Promise.all([
          supabase.from("profiles").select(PERSON_COLUMNS).ilike("username", pattern).neq("id", me).limit(SEARCH_LIMIT),
          supabase.from("profiles").select(PERSON_COLUMNS).ilike("display_name", pattern).neq("id", me).limit(SEARCH_LIMIT),
        ]);
        if (byUsername.error) throw byUsername.error;
        if (byName.error) throw byName.error;
        const merged = new Map<string, Person>();
        for (const row of [...(byUsername.data ?? []), ...(byName.data ?? [])]) {
          const person = toPerson(row);
          if (!merged.has(person.id) && !blockedIds.current.has(person.id)) merged.set(person.id, person);
        }
        // Ceux dont le @ commence par la recherche passent en premier
        const lower = text.toLowerCase();
        const list = [...merged.values()].sort((a, b) => {
          const aStarts = (a.username ?? "").toLowerCase().startsWith(lower) ? 0 : 1;
          const bStarts = (b.username ?? "").toLowerCase().startsWith(lower) ? 0 : 1;
          return aStarts - bStarts || (a.username ?? "").localeCompare(b.username ?? "");
        });
        const ids = list.map((person) => person.id);
        const myStatuses = await loadMyStatuses(supabase, me, ids);
        if (id !== searchId.current) return; // une recherche plus récente est partie : on ignore celle-ci
        mergeStatuses(myStatuses, ids);
        setResults(list);
        setSearchedText(text);
        setSearchState("done");
      } catch (err) {
        if (id !== searchId.current) return;
        console.error("Recherche impossible :", err);
        setResults([]);
        setSearchState("error");
      }
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [searchText, me, mergeStatuses]);

  function nameOf(person: Person) {
    return personName(person, person.username ? `@${person.username}` : t("privacy.unknownUser"));
  }

  async function follow(person: Person) {
    setBusyKey(`follow:${person.id}`);
    setMessage(null);
    try {
      const status = await followUser(createClient(), me, person.id);
      mergeStatuses(new Map([[person.id, status]]), [person.id]);
      const key = status === "pending" ? "people.requestSent" : "people.nowFollowing";
      setMessage({ kind: "success", text: t(key).replace("{name}", nameOf(person)) });
    } catch (err) {
      console.error("Abonnement impossible :", err);
      setMessage({ kind: "error", text: t("publicProfile.followError") });
    }
    setBusyKey(null);
    await loadLists(me);
  }

  // Confirmation : annuler ma demande ou me désabonner
  async function confirmRemove() {
    if (!confirm) return;
    const { kind, person } = confirm;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await unfollowUser(createClient(), me, person.id);
    } catch (err) {
      console.error("Désabonnement impossible :", err);
      setConfirmBusy(false);
      setConfirmError(t("publicProfile.actionError"));
      return;
    }
    mergeStatuses(new Map(), [person.id]);
    setConfirmBusy(false);
    setConfirm(null);
    const key = kind === "unfollow" ? "people.unfollowed" : "people.requestCancelled";
    setMessage({ kind: "success", text: t(key).replace("{name}", nameOf(person)) });
    await loadLists(me);
  }

  async function answerRequest(person: Person, accept: boolean) {
    setBusyKey(`${accept ? "accept" : "refuse"}:${person.id}`);
    setMessage(null);
    const supabase = createClient();
    const { error } = accept
      ? await supabase.from("follows").update({ status: "accepted" }).eq("follower_id", person.id).eq("followed_id", me)
      : await supabase.from("follows").delete().eq("follower_id", person.id).eq("followed_id", me);
    if (error) {
      console.error(`Réponse à la demande impossible : ${error.message} (code ${error.code})`);
      setBusyKey(null);
      setMessage({ kind: "error", text: t("privacy.actionError") });
      return;
    }
    // La ligne disparaît tout de suite ; « Nouveaux abonnés » est rechargé juste après
    setRequests((list) => list.filter((p) => p.id !== person.id));
    setMessage({ kind: "success", text: accept ? t("people.requestAccepted") : t("people.requestRefused") });
    setBusyKey(null);
    await loadLists(me);
  }

  function followButton(person: Person, followBack: boolean) {
    return (
      <FollowButton
        size="small"
        status={statuses.get(person.id) ?? null}
        busy={busyKey === `follow:${person.id}`}
        name={nameOf(person)}
        followBack={followBack}
        onFollow={() => follow(person)}
        onPending={() => {
          setConfirmError("");
          setConfirm({ kind: "cancelRequest", person });
        }}
        onAccepted={() => {
          setConfirmError("");
          setConfirm({ kind: "unfollow", person });
        }}
      />
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  // Moins de 2 caractères : message d'aide et aucun résultat, quel que soit l'état de la dernière recherche
  const shownState: SearchState = tooShort ? "hint" : searchState;
  const shownResults = tooShort ? [] : results;

  const searchAnnouncement =
    shownState === "loading"
      ? t("people.searching")
      : shownState === "error"
        ? t("people.searchError")
        : shownState === "done"
          ? shownResults.length === 0
            ? t("people.noResult").replace("{q}", searchedText)
            : shownResults.length === 1
              ? t("people.oneResult")
              : t("people.results").replace("{n}", String(shownResults.length))
          : "";

  const confirmHandle = !confirm ? "" : confirm.person.username ? `@${confirm.person.username}` : nameOf(confirm.person);

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-6 pb-12 pt-8">
        <Link href="/accueil" className="self-start text-sm font-semibold text-muted">
          {t("common.back")}
        </Link>
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("people.title")}</h1>

        {/* Messages des actions (suivre, accepter…) */}
        <p aria-live="polite" className={`mt-3 min-h-5 text-sm ${message?.kind === "error" ? "text-danger" : "text-accent-ink"}`}>
          {message?.text ?? ""}
        </p>

        {/* a) Recherche */}
        <section aria-labelledby="titre-recherche" className="mt-3">
          <h2 id="titre-recherche" className="sr-only">
            {t("people.searchLabel")}
          </h2>
          <label htmlFor="recherche-personnes" className="sr-only">
            {t("people.searchLabel")}
          </label>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              id="recherche-personnes"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("people.searchPlaceholder")}
              aria-describedby="recherche-etat"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-full border border-accent-ink/40 bg-surface py-3 pl-12 pr-4 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink"
            />
          </div>
          {shownState === "hint" && <p className="mt-2 text-sm text-muted">{t("people.searchHint")}</p>}
          <p id="recherche-etat" aria-live="polite" className={`mt-2 text-sm ${shownState === "error" ? "text-danger" : "text-muted"}`}>
            {searchAnnouncement}
          </p>
          {shownResults.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {shownResults.map((person) => (
                <PersonRow key={person.id} person={person} actions={followButton(person, false)} />
              ))}
            </ul>
          )}
        </section>

        {listsError && <p className="mt-8 text-sm text-danger">{t("privacy.loadError")}</p>}

        {/* b) Demandes d'abonnement (bloc masqué s'il n'y en a aucune) */}
        {requests.length > 0 && (
          <section aria-labelledby="titre-demandes" className="mt-10">
            <h2 id="titre-demandes" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              {t("people.requests")} ({requests.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {requests.map((person) => {
                const name = nameOf(person);
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
                          onClick={() => answerRequest(person, true)}
                        />
                        <RowButton
                          label={t("privacy.refuse")}
                          ariaLabel={t("people.refuseLabel").replace("{name}", name)}
                          busy={busyKey === `refuse:${person.id}`}
                          disabled={rowBusy}
                          variant="secondary"
                          onClick={() => answerRequest(person, false)}
                        />
                      </>
                    }
                  />
                );
              })}
            </ul>
          </section>
        )}

        {/* c) Nouveaux abonnés */}
        <section aria-labelledby="titre-abonnes" className="mt-10">
          <h2 id="titre-abonnes" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("people.newFollowers")}
          </h2>
          {followers.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{t("people.noFollowers")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {followers.map(({ person, createdAt }) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  subtitle={relativeTime(createdAt, language)}
                  actions={followButton(person, true)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "unfollow"
            ? t("publicProfile.unfollowConfirmTitle").replace("{handle}", confirmHandle)
            : t("people.cancelRequestTitle").replace("{handle}", confirmHandle)
        }
        confirmLabel={confirm?.kind === "unfollow" ? t("publicProfile.unfollow") : t("publicProfile.cancelRequest")}
        danger={confirm?.kind === "unfollow"}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={confirmRemove}
        onClose={() => setConfirm(null)}
      />
    </main>
  );
}
