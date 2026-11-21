"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SocialButtons from "../../components/SocialButtons";
import { createClient } from "../../lib/supabase/client";

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      setError(
        msg.includes("not confirmed")
          ? "Confirme d’abord ton adresse : clique sur le lien reçu par courriel."
          : "Courriel ou mot de passe incorrect."
      );
      return;
    }

    router.push("/accueil");
  }

  const fieldClass =
    "w-full rounded-xl border border-[#39ff14]/40 bg-black/60 px-4 py-3 text-base text-white placeholder:text-neutral-500 outline-none focus:border-[#39ff14]";

  return (
    <main className="bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-8">
        <Link href="/" className="text-sm font-semibold text-neutral-400">
          Retour
        </Link>

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">Content de te revoir</h1>
        <p className="mt-2 text-sm text-neutral-400">Connecte-toi pour retrouver ta communauté.</p>

        <div className="mt-8">
          <SocialButtons />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
              Courriel
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="toi@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Ton mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-2xl bg-[#39ff14] py-4 text-base font-bold text-black disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          {error && (
            <p aria-live="polite" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </form>

        <p className="mt-auto pt-10 text-center text-sm text-neutral-400">
          Pas encore de compte?{" "}
          <Link href="/inscription" className="font-bold text-[#39ff14]">
            Crée-en un
          </Link>
        </p>
      </div>
    </main>
  );
}