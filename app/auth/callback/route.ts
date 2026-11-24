import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RETURN_COOKIE, safeReturnPath } from "../../../lib/share";
import { createClient } from "../../../lib/supabase/server";

// Google renvoie la personne ici avec un code : on l'échange contre une vraie connexion
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Chemin où revenir (lien partagé ouvert avant la connexion), gardé dans un cookie par SocialButtons.
  // Seulement un chemin interne ; le cookie est effacé dans tous les cas.
  const cookieStore = await cookies();
  const raw = cookieStore.get(RETURN_COOKIE)?.value;
  let retour: string | null = null;
  try {
    retour = safeReturnPath(raw ? decodeURIComponent(raw) : null);
  } catch {
    retour = null;
  }

  let response = NextResponse.redirect(`${origin}/connexion`);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      response = NextResponse.redirect(`${origin}${retour ?? "/accueil"}`);
    }
  }
  if (raw !== undefined) response.cookies.delete(RETURN_COOKIE);
  return response;
}
