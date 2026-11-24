import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

// Pages publiques des liens partagés (/e/<id>, /p/<id>) pour les visiteurs non connectés.
// Composants serveur : textes en français écrits ici (la traduction de l'app ne fonctionne que dans le navigateur).

export function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-5 pb-10 pt-8">
        <p className="text-center text-3xl font-black italic tracking-tight">
          VY<span className="text-accent-ink">BE</span>
        </p>
        <p className="mt-1 text-center text-sm text-muted">Le réseau social des sportifs</p>
        <div className="mt-8 flex flex-1 flex-col">{children}</div>
      </div>
    </main>
  );
}

// Gros bouton vert « Ouvrir dans Vybe » (mène à la connexion, avec retour sur le lien partagé)
export function OpenInVybe({ href }: { href: string }) {
  return (
    <div className="mt-auto flex flex-col gap-3 pt-8">
      <Link
        href={href}
        className="flex min-h-14 items-center justify-center rounded-2xl bg-accent text-base font-bold text-on-accent shadow-[0_0_22px_rgba(57,255,20,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        Ouvrir dans Vybe
      </Link>
      <Link
        href="/inscription"
        className="flex min-h-12 items-center justify-center rounded-2xl border border-accent-ink text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        Créer un compte
      </Link>
    </div>
  );
}

// Contenu non public, introuvable ou réservé aux abonnés : aucune donnée, juste une invitation à se connecter
export function GenericInvite({ loginHref }: { loginHref: string }) {
  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-10 text-center">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <h1 className="text-xl font-bold">Connecte-toi pour voir ce contenu</h1>
        <p className="text-sm text-muted">Ce lien a été partagé depuis Vybe. Connecte-toi ou crée un compte pour l’ouvrir.</p>
      </div>
      <OpenInVybe href={loginHref} />
    </>
  );
}

export function PreviewCover({ src, fallback }: { src: string | null; fallback?: ReactNode }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#020702,#0b3d12)]">
      {src ? (
        <Image src={src} alt="" fill unoptimized={src.startsWith("http")} sizes="(max-width: 500px) 100vw, 460px" className="object-cover" priority />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl">{fallback}</div>
      )}
    </div>
  );
}

export function PreviewLoading() {
  return (
    <SharedLayout>
      <div role="status" aria-label="Chargement…" className="flex flex-col gap-3">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-surface" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-surface" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface" />
      </div>
    </SharedLayout>
  );
}
