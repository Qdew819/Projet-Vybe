import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { renderMarkdown, type MarkdownClasses } from "../../lib/markdown";

// Politique de confidentialité : page publique (aucune connexion nécessaire), rendue côté serveur à partir de
// content/politique-confidentialite.md (le texte n'est pas modifié ici : on ne fait que l'afficher).
// Le fichier est lu une seule fois (au build) : il ne dépend pas de la requête.
const source = readFileSync(path.join(process.cwd(), "content", "politique-confidentialite.md"), "utf8");

export const metadata: Metadata = {
  title: "Politique de confidentialité – Vybe",
  description: "Quels renseignements personnels Vybe recueille, pourquoi, avec qui ils sont partagés et quels sont tes droits.",
};

// Thème Vybe : titres en blanc (texte foncé en mode clair), liens et accents en vert néon (accent-ink),
// tableau lisible et défilable horizontalement sur téléphone
const classes: MarkdownClasses = {
  h1: "text-3xl font-black leading-tight tracking-tight text-white light:text-foreground",
  h2: "mt-10 text-xl font-bold text-white light:text-foreground",
  h3: "mt-6 text-base font-bold text-white light:text-foreground",
  p: "mt-3 leading-relaxed",
  ul: "mt-3 list-disc space-y-1.5 pl-6 leading-relaxed marker:text-accent-ink",
  ol: "mt-3 list-decimal space-y-1.5 pl-6 leading-relaxed marker:font-bold marker:text-accent-ink",
  li: "pl-1",
  hr: "mt-10 border-line",
  link: "break-words font-semibold text-accent-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink",
  strong: "font-bold text-white light:text-foreground",
  tableWrap: "mt-4 overflow-x-auto rounded-2xl border border-line [-webkit-overflow-scrolling:touch]",
  table: "w-full min-w-[560px] border-collapse text-left text-sm",
  th: "border-b border-line bg-surface px-3 py-2.5 align-bottom font-bold text-accent-ink",
  td: "border-b border-line px-3 py-2.5 align-top leading-snug",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-2xl font-black italic tracking-tight text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          VYBE
        </Link>
        <article className="mt-6 text-[15px] text-foreground/90">{renderMarkdown(source, classes)}</article>
      </div>
    </main>
  );
}
