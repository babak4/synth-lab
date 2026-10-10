/**
 * A deliberately small Markdown subset for help content, parsed to a typed tree (never to HTML), so the
 * drawer can render links, glossary terms and diagrams as real components and nothing can inject markup.
 *
 * Blocks:   ## headings (levels 2–4), paragraphs, - bullet lists, 1. numbered lists, > quotes,
 *           ::diagram{name="harmonics"} directives
 * Inline:   **bold**, *italic*, `code`, [text](help:entry-id), [text](term:glossary-term)
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'diagram'; name: string };

// ── inline ──────────────────────────────────────────────────────────────────────────────────

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: 'code', text: m[2] });
    else if (m[3] !== undefined) out.push({ type: 'link', href: m[4]!, children: parseInline(m[3]) });
    else out.push({ type: 'em', children: parseInline((m[5] ?? m[6])!) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// ── blocks ──────────────────────────────────────────────────────────────────────────────────

const DIRECTIVE = /^::diagram\{name="([\w-]+)"\}\s*$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length as 2 | 3 | 4, text: heading[2]! });
      i++;
      continue;
    }
    const directive = DIRECTIVE.exec(line);
    if (directive) {
      blocks.push({ type: 'diagram', name: directive[1]! });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const marker = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: Inline[][] = [];
      while (i < lines.length && marker.test(lines[i]!)) {
        let text = lines[i]!.replace(marker, '');
        i++;
        // continuation lines (indented, non-blank, not a new item)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !marker.test(lines[i]!)) text += ' ' + lines[i++]!.trim();
        items.push(parseInline(text));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) parts.push(lines[i++]!.replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', children: parseInline(parts.join(' ')) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{2,4}\s|::diagram|>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) });
  }
  return blocks;
}

// ── helpers over the tree ───────────────────────────────────────────────────────────────────

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('');
}

export function blockText(b: Block): string {
  switch (b.type) {
    case 'heading':
      return b.text;
    case 'paragraph':
    case 'quote':
      return inlineText(b.children);
    case 'list':
      return b.items.map(inlineText).join(' ');
    case 'diagram':
      return '';
  }
}

/** Every link in the document, in order. */
export function collectLinks(blocks: Block[]): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.type === 'link') out.push({ href: n.href, text: inlineText(n.children) });
      if (n.type === 'strong' || n.type === 'em' || n.type === 'link') walk(n.children);
    }
  };
  for (const b of blocks) {
    if (b.type === 'paragraph' || b.type === 'quote') walk(b.children);
    else if (b.type === 'list') b.items.forEach(walk);
  }
  return out;
}

/** Plain prose of the document (headings excluded), for word counts and reading level. */
export function proseText(blocks: Block[]): string {
  return blocks.filter((b) => b.type !== 'heading' && b.type !== 'diagram').map(blockText).join(' ');
}

export const wordCount = (text: string): number => (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
