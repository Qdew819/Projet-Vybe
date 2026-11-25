import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "./supabase/server";

// Administration (côté serveur uniquement) : comptes autorisés dans la variable d'environnement ADMIN_USER_IDS
// (identifiants Supabase séparés par des virgules). La personne est identifiée par sa session (cookies),
// jamais par un identifiant envoyé dans la requête.

function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

// Identifiant de la personne connectée si elle est administratrice, sinon null
export async function currentAdminId(): Promise<string | null> {
  const ids = adminIds();
  if (ids.size === 0) return null;
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && ids.has(user.id) ? user.id : null;
}

// Client avec la clé administrateur (contourne les règles d'accès) : seulement après currentAdminId()
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
