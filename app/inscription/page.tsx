"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SocialButtons from "../../components/SocialButtons";
import { createClient } from "../../lib/supabase/client";

type Status = { type: "error" | "info"; text: string } | null;

export default function Inscription() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: name } },
    });

    setLoading(false);

    if (error) {
      const text = error.message.toLowerCase().includes("already")
        ? "Un compte existe déjà avec ce courriel. Essaie de te connecter."
        : "Impossible de créer le compte pour l’instant. Vérifie ton courriel et ton mot de passe, puis réessaie.";
      setStatus({ type: "error", text });
      return;
    }

    // Si Supabase ne demande pas de confirmation, la personne est déjà connectée
    if (data.session) {
      router.push("/accueil");
      return;
    }

    setStatus({
      type: "info",
      text: "Compte créé! Va dans ta boîte courriel et clique sur le lien pour confirmer ton adresse, puis reviens te connecter.",
    });
  }

  const fieldClass =
    "w-full rounded-xl border border-[#39ff14]/40 bg-black/60 px-4 py-3 text-base text-white placeholder:text-neutral-500 outline-none focus:border-[#39ff14]";

  return (
    <main className="bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-8">
        <Link href="/" className="text-sm font-semibold text-neutral-400">
          Retour
        </Link>

        <h1 className="mt-10 text-4xl font-black italic tracking-tight">Rejoins Vybe</h1>
        <p className="mt-2 text-sm text-neutral-400">Crée ton compte et trouve ta prochaine game.</p>

        <div className="mt-8">
          <SocialButtons />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
              Prénom
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="given-name"
              placeholder="Ton prénom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>

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
              minLength={8}
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#39ff14]" />
            <span>J’ai 16 ans ou plus et j’accepte les conditions d’utilisation et la politique de confidentialité.</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-2xl bg-[#39ff14] py-4 text-base font-bold text-black disabled:opacity-60"
          >
            {loading ? "Création en cours…" : "Créer mon compte"}
          </button>

          {status && (
            <p
              aria-live="polite"
              className={`text-sm ${status.type === "error" ? "text-red-400" : "text-[#39ff14]"}`}
            >
              {status.text}
            </p>
          )}
        </form>

        <p className="mt-auto pt-10 text-center text-sm text-neutral-400">
          Déjà un compte?{" "}
          <Link href="/connexion" className="font-bold text-[#39ff14]">
            Connecte-toi
          </Link>
        </p>
      </div>
    </main>
  );
}