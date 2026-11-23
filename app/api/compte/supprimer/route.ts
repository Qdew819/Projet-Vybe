import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "../../../../lib/supabase/server";

// Dossiers personnels à vider dans le stockage avant de supprimer le compte
const BUCKETS = ["avatars", "covers"];
const PAGE_SIZE = 100;

// Supprime tous les fichiers du dossier <userId>/ d'un espace de stockage (par paquets de 100)
async function emptyUserFolder(admin: SupabaseClient, bucket: string, userId: string) {
  for (;;) {
    const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: PAGE_SIZE });
    if (error) throw error;
    if (!files || files.length === 0) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError) throw removeError;
    if (files.length < PAGE_SIZE) return;
  }
}

// POST /api/compte/supprimer : supprime définitivement le compte de la personne connectée.
// La personne est identifiée UNIQUEMENT par sa session (cookies) : aucun identifiant n'est lu dans la requête.
export async function POST() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "Tu dois être connecté." }, { status: 401 });
  }

  // Clé administrateur : seulement côté serveur, jamais exposée au navigateur
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !url) {
    return Response.json({ ok: false, error: "Suppression indisponible pour l’instant." }, { status: 500 });
  }

  const admin = createAdminClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Photos de profil et de fond
    for (const bucket of BUCKETS) {
      await emptyUserFolder(admin, bucket, user.id);
    }
    // 2. Le compte (profiles, private_profiles et follows se vident en cascade dans la base)
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (err) {
    // Détails seulement dans les journaux du serveur, jamais dans la réponse
    console.error("Suppression du compte impossible :", err);
    return Response.json(
      { ok: false, error: "Impossible de supprimer ton compte pour l’instant. Réessaie dans un instant." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
