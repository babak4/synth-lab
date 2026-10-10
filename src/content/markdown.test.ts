import { describe, expect, it } from 'vitest';
import { collectLinks, inlineText, parseInline, parseMarkdown, proseText, wordCount } from './markdown';

describe('parseInline', () => {
  it('parses bold, italic, code and links, nested and in sequence', () => {
    expect(parseInline('a **bold** and *italic* and `code`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'em', children: [{ type: 'text', text: 'italic' }] },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'code' },
    ]);
    expect(parseInline('see [the filter](help:filter) now')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', href: 'help:filter', children: [{ type: 'text', text: 'the filter' }] },
      { type: 'text', text: ' now' },
    ]);
    expect(parseInline('**[cutoff](help:filter-cutoff)**')).toEqual([{ type: 'strong', children: [{ type: 'link', href: 'help:filter-cutoff', children: [{ type: 'text', text: 'cutoff' }] }] }]);
  });

  it('leaves stray asterisks, underscores and brackets alone', () => {
    expect(inlineText(parseInline('2 * 3 = 6 and snake_case_name and [not a link]'))).toBe('2 * 3 = 6 and snake_case_name and [not a link]');
  });

  it('never produces markup from angle brackets (it is text, not HTML)', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }]);
  });
});

describe('parseMarkdown', () => {
  const doc = `## What it is

A short **intro** that
wraps over two lines.

- first [term](term:harmonic)
- second
  continues here

1. one
2. two

> a quote

::diagram{name="harmonics"}

### Detail
`;
  const blocks = parseMarkdown(doc);

  it('splits into headings, paragraphs, lists, quotes and diagram directives', () => {
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'diagram', 'heading']);
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, text: 'What it is' });
    expect(blocks[5]).toEqual({ type: 'diagram', name: 'harmonics' });
    expect(blocks[6]).toEqual({ type: 'heading', level: 3, text: 'Detail' });
  });

  it('joins wrapped lines into one paragraph and list continuation lines into their item', () => {
    expect(proseText([blocks[1]!])).toBe('A short intro that wraps over two lines.');
    const list = blocks[2]! as Extract<typeof blocks[number], { type: 'list' }>;
    expect(list.ordered).toBe(false);
    expect(list.items.length).toBe(2);
    expect(inlineText(list.items[1]!)).toBe('second continues here');
    expect((blocks[3] as { ordered: boolean }).ordered).toBe(true);
  });

  it('collects links in document order', () => {
    expect(collectLinks(blocks)).toEqual([{ href: 'term:harmonic', text: 'term' }]);
  });

  it('proseText leaves out headings and diagrams, and wordCount counts words', () => {
    expect(proseText(blocks)).not.toContain('What it is');
    expect(wordCount("It's a well-known thing, 3 times.")).toBe(6);
  });

  it('handles Windows line endings and empty input', () => {
    expect(parseMarkdown('## A\r\n\r\ntext\r\n').map((b) => b.type)).toEqual(['heading', 'paragraph']);
    expect(parseMarkdown('')).toEqual([]);
  });
});
