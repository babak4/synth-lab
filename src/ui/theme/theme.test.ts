import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

/** Pull `{ ... }` bodies by selector so light and both dark paths are checked separately. */
function body(selector: string): string {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  light: { ...tokens(body(':root {')) },
  'dark (media)': { ...tokens(body(':root:not([data-theme=')) },
  'dark (explicit)': { ...tokens(body(":root[data-theme='dark']")) },
};

describe.each(Object.entries(themes))('%s theme contrast (WCAG 2.2 AA)', (_name, t) => {
  const text: [string, string][] = [
    ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'], ['text-muted', 'surface'], ['text-muted', 'bg'],
    ['text', 'accent-soft'], ['accent', 'surface'], ['accent-contrast', 'accent'], ['danger', 'surface'],
  ];
  it.each(text)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  const graphical: [string, string][] = [['focus', 'surface'], ['focus', 'bg'], ['border', 'surface'], ['border', 'bg']];
  it.each(graphical)('%s against %s ≥ 3:1 (non-text)', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('dark theme blocks agree', () => {
  it('media-query and explicit dark tokens are identical', () => {
    expect(themes['dark (media)']).toEqual(themes['dark (explicit)']);
  });
});
