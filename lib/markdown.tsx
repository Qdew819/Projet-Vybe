import type { ReactNode } from "react";

// Petit rendu Markdown côté serveur pour les pages de texte (politique de confidentialité…), sans librairie.
// Reconnaît : titres #, ##, ###, paragraphes (un retour à la ligne simple = saut de ligne), **gras**, *italique*,
// listes « - » et « 1. », tableaux GFM (| a | b |), séparateurs ---, adresses https://… et courriels (liens).
// Produit des éléments React (le texte est échappé par React : aucun HTML brut n'est injecté).

export type MarkdownClasses = {
  h1: string;
  h2: string;
  h3: string;
  p: string;
  ul: string;
  ol: string;
  li: string;
  hr: string;
  link: string;
  strong: string;
  tableWrap: string;
  table: string;
  th: string;
  td: string;
};

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|https?:\/\/[^\s)<>]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function inline(text: string, c: MarkdownClasses, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (token.startsWith("**")) {
      out.push(
        <strong key={k} className={c.strong}>
          {inline(token.slice(2, -2), c, k)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      out.push(<em key={k}>{inline(token.slice(1, -1), c, k)}</em>);
    } else if (token.startsWith("http")) {
      // Ponctuation finale (point, virgule…) laissée hors du lien
      const url = token.replace(/[.,;:!?]+$/, "");
      out.push(
        <a key={k} href={url} className={c.link} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      );
      if (url.length < token.length) out.push(token.slice(url.length));
    } else {
      out.push(
        <a key={k} href={`mailto:${token}`} className={c.link}>
          {token}
        </a>
      );
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Lignes d'un paragraphe : un retour à la ligne simple devient un saut de ligne (blocs d'adresse, signatures)
function lines(list: string[], c: MarkdownClasses, key: string): ReactNode[] {
  return list.flatMap((line, i) => (i === 0 ? inline(line, c, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...inline(line, c, `${key}-${i}`)]));
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

export function renderMarkdown(source: string, c: MarkdownClasses): ReactNode[] {
  const rows = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const next = () => `b${n++}`;

  while (i < rows.length) {
    const row = rows[i];
    const trimmed = row.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const key = next();

    // Titres
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2], c, key);
      blocks.push(
        level === 1 ? (
          <h1 key={key} className={c.h1}>
            {content}
          </h1>
        ) : level === 2 ? (
          <h2 key={key} className={c.h2}>
            {content}
          </h2>
        ) : (
          <h3 key={key} className={c.h3}>
            {content}
          </h3>
        )
      );
      i++;
      continue;
    }

    // Séparateur
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key} className={c.hr} />);
      i++;
      continue;
    }

    // Tableau : ligne d'en-tête | … |, puis |---|---|
    if (trimmed.startsWith("|") && i + 1 < rows.length && /^\|?\s*:?-{3,}/.test(rows[i + 1].trim())) {
      const head = cells(trimmed);
      i += 2;
      const body: string[][] = [];
      while (i < rows.length && rows[i].trim().startsWith("|")) body.push(cells(rows[i++]));
      blocks.push(
        <div key={key} className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                {head.map((cell, j) => (
                  <th key={j} scope="col" className={c.th}>
                    {inline(cell, c, `${key}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((cols, r) => (
                <tr key={r}>
                  {cols.map((cell, j) => (
                    <td key={j} className={c.td}>
                      {inline(cell, c, `${key}-${r}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Listes
    const bullet = /^[-*]\s+/;
    const numbered = /^\d+\.\s+/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      const ordered = numbered.test(trimmed);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < rows.length && pattern.test(rows[i].trim())) items.push(rows[i++].trim().replace(pattern, ""));
      const children = items.map((item, j) => (
        <li key={j} className={c.li}>
          {inline(item, c, `${key}-${j}`)}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} className={c.ol}>
            {children}
          </ol>
        ) : (
          <ul key={key} className={c.ul}>
            {children}
          </ul>
        )
      );
      continue;
    }

    // Paragraphe : lignes jusqu'à la prochaine ligne vide ou un autre bloc
    const para: string[] = [];
    while (
      i < rows.length &&
      rows[i].trim() &&
      !/^(#{1,3})\s/.test(rows[i].trim()) &&
      !/^(-{3,}|\*{3,})$/.test(rows[i].trim()) &&
      !rows[i].trim().startsWith("|") &&
      !bullet.test(rows[i].trim()) &&
      !numbered.test(rows[i].trim())
    ) {
      para.push(rows[i++].trim());
    }
    blocks.push(
      <p key={key} className={c.p}>
        {lines(para, c, key)}
      </p>
    );
  }
  return blocks;
}
