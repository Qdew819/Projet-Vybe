"use client";

import Link from "next/link";
import { useState } from "react";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("La connexion sera activée à la prochaine étape, quand on branchera Supabase.");
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

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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

          <button type="submit" className="mt-2 rounded-2xl bg-[#39ff14] py-4 text-base font-bold text-black">
            Se connecter
          </button>

          {message && (
            <p aria-live="polite" className="text-sm text-neutral-300">
              {message}
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