"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCloseDialogOnHide } from "../lib/useCloseDialogOnHide";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { absoluteUrl } from "../lib/share";
import { useMounted } from "../lib/useMounted";

export type ShareContent = {
  url: string; // chemin (« /e/123 ») ou adresse complète
  title: string;
  text: string;
};

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Avion en papier
export function SendIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className} strokeWidth={2}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

// Partage : la feuille de partage du téléphone (Snapchat, Instagram, WhatsApp, Messages…) si elle existe,
// sinon notre feuille « Envoyer à… ». share() est à appeler au clic ; ui est à placer une fois dans la page.
export function useShare() {
  const t = useT();
  const mounted = useMounted();
  const [sheet, setSheet] = useState<(ShareContent & { absolute: string }) | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(text: string) {
    setToast((current) => (current === text ? `${text} ` : text));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  async function share(content: ShareContent) {
    const absolute = absoluteUrl(content.url);
    // Vérifié au clic (donc après le montage) : jamais pendant le premier rendu
    if (mounted && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: content.title, text: content.text, url: absolute });
        return;
      } catch (err) {
        // Annulé par la personne : rien à dire
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Autre échec : on propose notre feuille
      }
    }
    setSheet({ ...content, absolute });
  }

  const ui = mounted
    ? createPortal(
        <>
          <ShareSheet content={sheet} onClose={() => setSheet(null)} onCopied={() => showToast(t("share.copied"))} />
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
            {toast && <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-lg">{toast}</p>}
          </div>
        </>,
        document.body
      )
    : null;

  return { share, ui };
}

// Bouton « Envoyer » : avec texte (par défaut) ou icône seule (barres d'actions, cartes)
export default function ShareButton({
  url,
  title,
  text,
  variant = "full",
  label,
  className,
}: ShareContent & {
  variant?: "full" | "icon";
  label?: string; // texte du bouton (« Envoyer » par défaut, « Partager le profil »…)
  className?: string;
}) {
  const t = useT();
  const { share, ui } = useShare();
  const name = label ?? t("share.send");
  const base = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => void share({ url, title, text })}
          aria-label={name}
          title={name}
          className={className ?? `flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-accent-ink ${base}`}
        >
          <SendIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void share({ url, title, text })}
          className={
            className ??
            `flex min-h-11 items-center gap-2 rounded-full border-2 border-accent-ink px-4 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-ink/10 ${base}`
          }
        >
          <SendIcon className="h-4 w-4" />
          {name}
        </button>
      )}
      {ui}
    </>
  );
}

// ---------- Feuille « Envoyer à… » (quand le téléphone n'a pas de feuille de partage) ----------

function ShareSheet({
  content,
  onClose,
  onCopied,
}: {
  content: (ShareContent & { absolute: string }) | null;
  onClose: () => void;
  onCopied: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialogRef);
  const firstRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const open = content !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      firstRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Le champ du lien apparaît quand la copie échoue : on le sélectionne pour qu'il soit facile à copier
  useEffect(() => {
    if (copyFailed) fieldRef.current?.select();
  }, [copyFailed]);

  async function copy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content.absolute);
      dialogRef.current?.close();
      onCopied();
    } catch (err) {
      console.error("Copie du lien impossible :", err);
      setCopyFailed(true);
    }
  }

  const url = content?.absolute ?? "";
  const message = content ? `${content.text} ${url}` : "";
  const targets: { key: string; label: string; href: string; icon: ReactNode }[] = content
    ? [
        {
          key: "whatsapp",
          label: "WhatsApp",
          href: `https://wa.me/?text=${encodeURIComponent(message)}`,
          icon: <path d="M3 21l1.6-4.6A9 9 0 1 1 8 19.6z M9 9.5c.5 2.5 2.5 4.5 5 5l1.2-1.2 2 1-.5 1.7c-3.5.3-8.5-4.7-8.2-8.2l1.7-.5 1 2z" />,
        },
        {
          key: "sms",
          label: t("share.sms"),
          href: `sms:?&body=${encodeURIComponent(message)}`,
          icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />,
        },
        {
          key: "email",
          label: t("share.email"),
          href: `mailto:?subject=${encodeURIComponent(content.title)}&body=${encodeURIComponent(message)}`,
          icon: (
            <>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </>
          ),
        },
        {
          key: "facebook",
          label: "Facebook",
          href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          icon: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z" />,
        },
        {
          key: "x",
          label: "X",
          href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(content.text)}&url=${encodeURIComponent(url)}`,
          icon: <path d="M4 4l16 16M20 4L4 20" />,
        },
      ]
    : [];

  const option =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left font-bold transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="share-sheet-title"
      onClose={() => {
        setCopyFailed(false);
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-[500px] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-background p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <h2 id="share-sheet-title" className="text-lg font-bold">
          {t("share.sheetTitle")}
        </h2>

        <button ref={firstRef} type="button" onClick={copy} className={option}>
          <svg {...iconProps} className="h-5 w-5 text-accent-ink" strokeWidth={2}>
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {t("share.copy")}
        </button>

        {copyFailed && (
          <div>
            <label htmlFor="share-lien" className="mb-1 block text-xs text-muted">
              {t("share.copyFallback")}
            </label>
            <input
              ref={fieldRef}
              id="share-lien"
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl border border-accent-ink/40 bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-accent-ink"
            />
          </div>
        )}

        <ul className="grid grid-cols-1 gap-2">
          {targets.map((target) => (
            <li key={target.key}>
              <a
                href={target.href}
                target={target.key === "sms" || target.key === "email" ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={() => dialogRef.current?.close()}
                className={option}
              >
                <svg {...iconProps} className="h-5 w-5 text-accent-ink" strokeWidth={2}>
                  {target.icon}
                </svg>
                {target.label}
              </a>
            </li>
          ))}
        </ul>

        <p className="text-xs leading-snug text-muted">{t("share.instagramNote")}</p>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="min-h-12 w-full rounded-2xl text-sm font-bold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {t("common.cancel")}
        </button>
      </div>
    </dialog>
  );
}
