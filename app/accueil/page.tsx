"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function Accueil() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const firstName = data.user.user_metadata?.first_name as string | undefined;
      setName(firstName || data.user.email || "");
      setReady(true);
    });
  }, [router]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black text-neutral-400">
        Chargement…
      </main>
    );
  }

  return (
    <main className="bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16">
        <h1 className="text-4xl font-black italic tracking-tight">
          Salut <span className="text-[#39ff14]">{name}</span>!
        </h1>
        <p className="mt-3 text-neutral-300">Tu es connecté. Les événements arrivent bientôt.</p>

        <button
          type="button"
          onClick={signOut}
          className="mt-auto rounded-2xl border border-[#39ff14] py-4 text-base font-bold text-[#39ff14]"
        >
          Se déconnecter
        </button>
      </div>
    </main>
  );
}