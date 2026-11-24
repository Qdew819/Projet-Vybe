import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { GenericInvite, OpenInVybe, PreviewCover, PreviewLoading, SharedLayout } from "../../../components/SharedPreview";
import { loginPathWithReturn, postSharePath } from "../../../lib/share";
import { shareMetadata } from "../../../lib/shareMetadata";
import { getPostPreview } from "../../../lib/sharePreview";
import { createClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

// Lien partagé d'une publication : /p/<id>. Visible sans compte seulement si l'auteur a un compte public
// (début du texte, première photo, pseudo).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostPreview(id);
  return shareMetadata(
    post ? { title: `@${post.username} sur Vybe`, description: post.excerpt || `Une publication de @${post.username} sur Vybe` } : null
  );
}

export default function SharedPostPage({ params }: Props) {
  // Cookies et base lus à la demande : dans un Suspense (cacheComponents)
  return (
    <Suspense fallback={<PreviewLoading />}>
      <SharedPost params={params} />
    </Suspense>
  );
}

async function SharedPost({ params }: Props) {
  const { id } = await params;

  // Déjà connecté : directement la vraie page de la publication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(`/publication/${encodeURIComponent(id)}`);

  const loginHref = loginPathWithReturn(postSharePath(id));
  const post = await getPostPreview(id);
  if (!post) {
    return (
      <SharedLayout>
        <GenericInvite loginHref={loginHref} />
      </SharedLayout>
    );
  }

  return (
    <SharedLayout>
      <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <p className="font-bold">
          {post.displayName ?? `@${post.username}`} <span className="text-sm font-normal text-muted">@{post.username}</span>
        </p>
        {post.excerpt && <p className="whitespace-pre-line break-words text-sm leading-snug">{post.excerpt}</p>}
        {post.imageUrl && <PreviewCover src={post.imageUrl} />}
      </article>
      <p className="mt-4 text-sm text-muted">Connecte-toi pour voir la publication en entier, aimer et commenter.</p>
      <OpenInVybe href={loginHref} />
    </SharedLayout>
  );
}
