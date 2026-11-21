import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Connexion à Supabase côté serveur (utilisée quand Google nous renvoie la personne)
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Ignoré : peut arriver quand ce code est appelé depuis une page
          }
        },
      },
    }
  );
}