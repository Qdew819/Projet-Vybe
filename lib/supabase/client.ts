import { createBrowserClient } from "@supabase/ssr";

// Crée la connexion entre le site et Supabase, avec les clés de .env.local
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  );
}