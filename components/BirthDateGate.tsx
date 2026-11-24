"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMyBirthDate } from "../lib/birthDate";
import { isLanguage } from "../lib/language";
import { createClient } from "../lib/supabase/client";
import { isThemeChoice } from "../lib/theme";

// Pages où l'on ne vérifie pas la date de naissance : écran d'accueil public, connexion, inscription, retour de
// Google, API, préférences (avant le profil) et les deux pages qui la demandent. Les fichiers publics (images…)
// ne passent jamais par ici.
const EXCLUDED = ["/connexion", "/inscription", "/auth", "/api", "/bienvenue", "/profil/creer", "/profil/naissance"];

function isExcluded(path: string): boolean {
  return path === "/" || EXCLUDED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Personne dont la date de naissance est déjà enregistrée : on ne revérifie pas à chaque page pendant la visite
let knownUserId: string | null = null;

export function markBirthDateKnown(userId: string) {
  knownUserId = userId;
}

// Compte connecté sans date de naissance (aucune ligne dans private_profiles) : redirection vers
// « Complète ton profil », ou vers la création du profil s'il n'y a pas encore de profil du tout.
// Placé dans app/template.tsx : l'adresse est lue dans l'effet (window.location), sans usePathname.
export default function BirthDateGate() {
  const router = useRouter();

  useEffect(() => {
    if (isExcluded(window.location.pathname)) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      // Session locale (pas d'appel réseau) : suffit pour savoir qui est connecté
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || knownUserId === user.id) return;
      // Préférences pas encore choisies : l'accueil envoie d'abord vers /bienvenue, on ne s'en mêle pas
      const meta = user.user_metadata ?? {};
      if (!isThemeChoice(meta.theme) || !isLanguage(meta.language)) return;

      let birthDate: string | null;
      try {
        birthDate = await fetchMyBirthDate(supabase, user.id);
      } catch (err) {
        // Lecture impossible : on ne bloque pas la personne
        console.error(err);
        return;
      }
      if (birthDate) {
        knownUserId = user.id;
        return;
      }
      const { data: profile, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      router.replace(!error && !profile ? "/profil/creer" : "/profil/naissance");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
