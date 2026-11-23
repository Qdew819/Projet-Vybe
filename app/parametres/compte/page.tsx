"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "../../../lib/i18n";
import { createClient } from "../../../lib/supabase/client";

const PASSWORD_MIN = 8;
const CONFIRM_WORD = "SUPPRIMER";

type Message = { kind: "success" | "error"; text: string } | null;

const fieldClass =
  "w-full rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink";
const sectionTitle = "mb-3 text-sm font-bold uppercase tracking-wide text-muted";
const primaryButton =
  "w-full rounded-2xl bg-accent py-3.5 text-base font-bold text-on-accent disabled:opacity-60";

// Champ mot de passe avec un bouton pour afficher ou cacher le texte
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`${fieldClass} pr-14`}
        />
        {/* Œil : affiche ou cache le mot de passe (œil barré quand il est visible) */}
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-controls={id}
          aria-label={visible ? t("account.hide") : t("account.show")}
          title={visible ? t("account.hide") : t("account.show")}
          className="absolute inset-y-0 right-2 my-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:text-accent-ink focus-visible:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
    </div>
  );
}

function StatusMessage({ message }: { message: Message }) {
  return (
    <p aria-live="polite" className={`text-sm ${message?.kind === "error" ? "text-danger" : "text-accent-ink"}`}>
      {message?.text ?? ""}
    </p>
  );
}

export default function CompteEtSecurite() {
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);

  // Mot de passe
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);

  // Courriel
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<Message>(null);

  // Appareils
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  // Suppression du compte
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/connexion");
          return;
        }
        // Le compte a un mot de passe s'il a une identité « email » (sinon : seulement Google)
        const providers = data.user.app_metadata?.providers;
        const list: string[] = Array.isArray(providers) ? providers : [data.user.app_metadata?.provider ?? ""];
        setHasPassword(list.includes("email"));
        setEmail(data.user.email ?? "");
        setReady(true);
      });
  }, [router]);

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < PASSWORD_MIN) {
      setPasswordMessage({ kind: "error", text: t("account.passwordTooShort") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: "error", text: t("account.passwordMismatch") });
      return;
    }
    setPasswordBusy(true);
    const { error } = await createClient().auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      console.error(`Changement du mot de passe impossible : ${error.message} (code ${error.code})`);
      setPasswordMessage({
        kind: "error",
        text:
          error.code === "same_password"
            ? t("account.passwordSame")
            : error.code === "weak_password"
              ? t("account.passwordWeak")
              : t("account.passwordError"),
      });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage({ kind: "success", text: t("account.passwordChanged") });
  }

  async function changeEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailMessage(null);
    const value = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailMessage({ kind: "error", text: t("account.emailInvalid") });
      return;
    }
    if (value.toLowerCase() === email.toLowerCase()) {
      setEmailMessage({ kind: "error", text: t("account.emailSame") });
      return;
    }
    setEmailBusy(true);
    const { error } = await createClient().auth.updateUser({ email: value });
    setEmailBusy(false);
    if (error) {
      console.error(`Changement du courriel impossible : ${error.message} (code ${error.code})`);
      setEmailMessage({
        kind: "error",
        text: error.code === "email_exists" ? t("account.emailTaken") : t("account.emailError"),
      });
      return;
    }
    setNewEmail("");
    setEmailMessage({ kind: "success", text: t("account.emailSent") });
  }

  async function signOutEverywhere() {
    setSignOutError("");
    setSignOutBusy(true);
    const { error } = await createClient().auth.signOut({ scope: "global" });
    if (error) {
      console.error(`Déconnexion de tous les appareils impossible : ${error.message} (code ${error.code})`);
      setSignOutBusy(false);
      setSignOutError(t("account.signOutError"));
      return;
    }
    router.replace("/");
  }

  function openDeleteDialog() {
    setConfirmText("");
    setDeletePassword("");
    setDeleteError("");
    dialogRef.current?.showModal();
  }

  async function deleteAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmText !== CONFIRM_WORD) return;
    setDeleteError("");
    setDeleteBusy(true);
    const supabase = createClient();

    // Compte avec mot de passe : on vérifie d'abord que c'est bien la bonne personne
    if (hasPassword) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
      if (error) {
        setDeleteBusy(false);
        setDeleteError(t("account.deleteWrongPassword"));
        return;
      }
    }

    try {
      const response = await fetch("/api/compte/supprimer", { method: "POST" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setDeleteBusy(false);
        setDeleteError(result?.error || t("account.deleteError"));
        return;
      }
    } catch (err) {
      console.error("Suppression du compte impossible :", err);
      setDeleteBusy(false);
      setDeleteError(t("account.deleteError"));
      return;
    }

    // Le compte n'existe plus : on efface la session de ce navigateur et on revient à l'accueil du site
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    router.replace("/");
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
        <h1 className="mt-8 text-3xl font-black italic tracking-tight">{t("account.title")}</h1>

        {/* 1. Mot de passe */}
        <section aria-labelledby="titre-mdp" className="mt-10">
          <h2 id="titre-mdp" className={sectionTitle}>
            {t("account.passwordSection")}
          </h2>
          {hasPassword ? (
            <form onSubmit={changePassword} className="flex flex-col gap-4">
              <PasswordField
                id="nouveau-mdp"
                label={t("account.newPassword")}
                value={newPassword}
                onChange={(value) => {
                  setNewPassword(value);
                  setPasswordMessage(null);
                }}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirme-mdp"
                label={t("account.confirmPassword")}
                value={confirmPassword}
                onChange={(value) => {
                  setConfirmPassword(value);
                  setPasswordMessage(null);
                }}
                autoComplete="new-password"
              />
              <p className="-mt-2 text-xs text-muted">{t("account.passwordHint")}</p>
              <StatusMessage message={passwordMessage} />
              <button type="submit" disabled={passwordBusy} className={primaryButton}>
                {passwordBusy ? t("common.saving") : t("account.changePassword")}
              </button>
            </form>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{t("account.passwordGoogle")}</p>
          )}
        </section>

        {/* 2. Courriel */}
        <section aria-labelledby="titre-courriel" className="mt-10">
          <h2 id="titre-courriel" className={sectionTitle}>
            {t("account.emailSection")}
          </h2>
          <p className="text-sm text-muted">{t("account.currentEmail")}</p>
          <p className="mb-4 break-all font-semibold">{email}</p>
          {hasPassword ? (
            <form onSubmit={changeEmail} className="flex flex-col gap-4">
              <div>
                <label htmlFor="nouveau-courriel" className="mb-1.5 block text-sm font-semibold">
                  {t("account.newEmail")}
                </label>
                <input
                  id="nouveau-courriel"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailMessage(null);
                  }}
                  placeholder={t("field.emailPlaceholder")}
                  className={fieldClass}
                />
              </div>
              <StatusMessage message={emailMessage} />
              <button type="submit" disabled={emailBusy} className={primaryButton}>
                {emailBusy ? t("common.saving") : t("account.changeEmail")}
              </button>
            </form>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{t("account.emailGoogle")}</p>
          )}
        </section>

        {/* 3. Appareils */}
        <section aria-labelledby="titre-appareils" className="mt-10">
          <h2 id="titre-appareils" className={sectionTitle}>
            {t("account.devicesSection")}
          </h2>
          <p className="mb-4 text-sm text-muted">{t("account.devicesHint")}</p>
          {signOutError && (
            <p aria-live="polite" className="mb-3 text-sm text-danger">
              {signOutError}
            </p>
          )}
          <button
            type="button"
            onClick={signOutEverywhere}
            disabled={signOutBusy}
            className="w-full rounded-2xl border-2 border-accent-ink py-3.5 text-base font-bold text-accent-ink disabled:opacity-60"
          >
            {signOutBusy ? t("account.signingOut") : t("account.signOutEverywhere")}
          </button>
        </section>

        {/* 4. Zone dangereuse */}
        <section aria-labelledby="titre-danger" className="mt-12 rounded-2xl border-2 border-danger p-5">
          <h2 id="titre-danger" className="text-lg font-bold text-danger">
            {t("account.deleteSection")}
          </h2>
          <p className="mt-2 text-sm">{t("account.deleteHint")}</p>
          <button
            type="button"
            onClick={openDeleteDialog}
            aria-haspopup="dialog"
            className="mt-4 w-full rounded-2xl border-2 border-danger py-3.5 text-base font-bold text-danger hover:bg-danger/10"
          >
            {t("account.deleteButton")}
          </button>
        </section>
      </div>

      {/* Confirmation : fenêtre modale native (focus gardé dedans, fermeture avec Échap) */}
      <dialog
        ref={dialogRef}
        aria-labelledby="titre-confirmation"
        aria-describedby="texte-confirmation"
        onCancel={(e) => {
          // Pas de fermeture avec Échap pendant la suppression
          if (deleteBusy) e.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border-2 border-danger bg-background p-6 text-foreground backdrop:bg-black/70"
      >
        <form onSubmit={deleteAccount} className="flex flex-col gap-4">
          <h2 id="titre-confirmation" className="text-xl font-black text-danger">
            {t("account.deleteConfirmTitle")}
          </h2>
          <p id="texte-confirmation" className="text-sm">
            {t("account.deleteHint")}
          </p>

          <div>
            <label htmlFor="confirmation-supprimer" className="mb-1.5 block text-sm font-semibold">
              {t("account.deleteTypeWord")}
            </label>
            <input
              id="confirmation-supprimer"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value.trim());
                setDeleteError("");
              }}
              className={fieldClass}
            />
          </div>

          {hasPassword && (
            <PasswordField
              id="mdp-actuel"
              label={t("account.currentPassword")}
              value={deletePassword}
              onChange={(value) => {
                setDeletePassword(value);
                setDeleteError("");
              }}
              autoComplete="current-password"
            />
          )}

          {deleteError && (
            <p aria-live="polite" className="text-sm text-danger">
              {deleteError}
            </p>
          )}

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={deleteBusy}
              className="flex-1 rounded-2xl border border-line py-3 text-sm font-bold disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={deleteBusy || confirmText !== CONFIRM_WORD || (hasPassword && deletePassword === "")}
              className="flex-1 rounded-2xl bg-danger py-3 text-sm font-bold text-background disabled:opacity-50"
            >
              {deleteBusy ? t("account.deleting") : t("account.deleteConfirm")}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
