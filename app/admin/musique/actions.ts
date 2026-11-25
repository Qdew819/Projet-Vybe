"use server";

import { revalidatePath } from "next/cache";
import { currentAdminId, serviceClient } from "../../../lib/admin";

// Active ou désactive un morceau de la bibliothèque. Droits revérifiés ici (une Server Action peut être appelée
// directement, sans passer par la page).
export async function setTrackActive(formData: FormData): Promise<void> {
  if (!(await currentAdminId())) throw new Error("Accès refusé");
  const id = String(formData.get("id") ?? "").trim();
  const active = formData.get("active") === "1";
  if (!id) throw new Error("Morceau manquant");
  const admin = serviceClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
  const { error } = await admin.from("music_tracks").update({ is_active: active }).eq("id", id);
  if (error) {
    console.error(`Mise à jour du morceau impossible : ${error.message} (code ${error.code})`);
    throw new Error("Mise à jour impossible");
  }
  revalidatePath("/admin/musique");
}
