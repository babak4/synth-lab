import { useId, type ReactNode } from 'react';
import { HELP } from '@/content/load';
import type { Block, Inline } from '@/content/markdown';
import { Diagram } from './Diagrams';

/** Hover/focus glossary term: underlined, with a one-line definition (PRD §4.1). */
function Term({ id, children }: { id: string; children: ReactNode }) {
  const tip = useId();
  const def = HELP.glossary[id];
  if (!def) return <>{children}</>;
  return (
    <button type="button" className="term" aria-describedby={tip}>
      {children}
      <span role="tooltip" id={tip} className="term-tip">
        <strong>{def.term}.</strong> {def.definition}
      </span>
    </button>
  );
}

export function InlineView({ nodes, open }: { nodes: Inline[]; open: (id: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text': return <span key={i}>{n.text}</span>;
          case 'code': return <code key={i}>{n.text}</code>;
          case 'strong': return <strong key={i}><InlineView nodes={n.children} open={open} /></strong>;
          case 'em': return <em key={i}><InlineView nodes={n.children} open={open} /></em>;
          case 'link': {
            const target = n.href.slice(n.href.indexOf(':') + 1);
            const inner = <InlineView nodes={n.children} open={open} />;
            if (n.href.startsWith('term:')) return <Term key={i} id={target}>{inner}</Term>;
            return <button key={i} type="button" className="help-link" onClick={() => open(target)}>{inner}</button>;
          }
        }
      })}
    </>
  );
}

/** Renders parsed blocks. `after` injects content after the blocks under a given H2 (used for "Try this" cards). */
export function BlocksView({ blocks, open, after }: { blocks: Block[]; open: (id: string) => void; after?: Record<string, ReactNode> }) {
  const out: ReactNode[] = [];
  let currentH2 = '';
  const flush = () => {
    if (after?.[currentH2]) out.push(<div key={`after-${currentH2}`}>{after[currentH2]}</div>);
  };
  blocks.forEach((b, i) => {
    if (b.type === 'heading' && b.level === 2) {
      flush();
      currentH2 = b.text.replace(/’/g, "'");
    }
    switch (b.type) {
      case 'heading': {
        const Tag = `h${b.level + 1}` as 'h3' | 'h4' | 'h5';
        out.push(<Tag key={i}>{b.text}</Tag>);
        break;
      }
      case 'paragraph': out.push(<p key={i}><InlineView nodes={b.children} open={open} /></p>); break;
      case 'quote': out.push(<blockquote key={i}><InlineView nodes={b.children} open={open} /></blockquote>); break;
      case 'list': {
        const items = b.items.map((it, j) => <li key={j}><InlineView nodes={it} open={open} /></li>);
        out.push(b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
        break;
      }
      case 'diagram': out.push(<Diagram key={i} name={b.name} />); break;
    }
  });
  flush();
  return <>{out}</>;
}
