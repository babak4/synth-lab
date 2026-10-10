import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { HELP } from '@/content/load';
import { buildIndex } from '@/content/index-list';
import { INDEX_ID } from '@/state/help-store';
import { HelpContext, useHelp } from './help-context';
import { BlocksView } from './render';
import { TryThisCards } from './TryThisCards';

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['TEXTAREA', 'SELECT'].includes(el.tagName) || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes((el as HTMLInputElement).type)));

/**
 * Provides `useHelp().open()` to every (?) button, and shows the drawer. The drawer sits BESIDE the
 * synth panel (the page reflows), never over it, so the controls it describes stay visible and playable.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const { helpStore } = useServices();
  const opener = useRef<HTMLElement | null>(null);

  const open = (id: string) => {
    if (!helpStore.getState().isOpen && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    helpStore.getState().open(id);
  };

  // `?` opens help for the focused control (or the index); Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault();
        const target = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>('[data-help-for]') : null;
        open(target?.dataset.helpFor ?? INDEX_ID);
      } else if (e.key === 'Escape' && helpStore.getState().isOpen && !isTyping(e.target)) {
        e.preventDefault(); // so the keyboard player does not also treat it as "all notes off"
        e.stopPropagation();
        helpStore.getState().close();
        opener.current?.focus?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpStore]);

  const close = () => {
    helpStore.getState().close();
    opener.current?.focus?.();
  };

  return <HelpContext.Provider value={{ open, close }}>{children}</HelpContext.Provider>;
}

/** The page shell: content on the left, the drawer beside it (the page reflows; nothing is covered). */
export function HelpLayout({ children }: { children: ReactNode }) {
  const { helpStore } = useServices();
  const isOpen = useStore(helpStore, (s) => s.isOpen);
  return (
    <div className={`app-shell${isOpen ? ' help-open' : ''}`}>
      <div className="app-content">{children}</div>
      <HelpDrawer />
    </div>
  );
}

function HelpDrawer() {
  const { close } = useHelp();
  const { helpStore, presetStore } = useServices();
  const { isOpen, current, canBack, canForward, scroll } = useStore(helpStore);
  const body = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef<string | null>(null);

  // Remember where we were in the entry we are leaving; restore the saved position for the one we arrive at.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    // (The previous entry's position was already saved by onScroll while it was on screen.)
    el.scrollTop = current ? (scroll[current] ?? 0) : 0;
    shown.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, helpStore]);

  // Move focus into the drawer when it opens or changes entry, so screen readers announce it.
  useEffect(() => {
    if (current) title.current?.focus({ preventScroll: true }); // scrolling here would undo the restored position
  }, [current]);

  // Outline the controls the entry describes.
  useEffect(() => {
    if (!current || current === INDEX_ID) return;
    const els = [...document.querySelectorAll<HTMLElement>(`[data-help-for="${current}"]`)];
    els.forEach((el) => el.classList.add('help-highlight'));
    els[0]?.scrollIntoView?.({ block: 'nearest' });
    return () => els.forEach((el) => el.classList.remove('help-highlight'));
  }, [current]);

  if (!isOpen || !current) return <aside className="help-drawer" aria-label="Help" hidden />;
  const open = (id: string) => helpStore.getState().open(id);
  const entry = current === INDEX_ID ? null : HELP.entries.get(current);

  return (
    <aside className="help-drawer" aria-label="Help" data-testid="help-drawer">
      <header className="help-head">
        <button type="button" onClick={() => helpStore.getState().back()} disabled={!canBack} aria-label="Back">←</button>
        <button type="button" onClick={() => helpStore.getState().forward()} disabled={!canForward} aria-label="Forward">→</button>
        <button type="button" onClick={() => open(INDEX_ID)} disabled={current === INDEX_ID}>Index</button>
        <button type="button" className="help-close" onClick={close} aria-label="Close help">×</button>
      </header>
      <div className="help-body" ref={body} onScroll={(e) => helpStore.getState().saveScroll(current, e.currentTarget.scrollTop)}>
        <h2 ref={title} tabIndex={-1} data-testid="help-title">{current === INDEX_ID ? 'Help index' : (entry?.title ?? current)}</h2>
        {current === INDEX_ID ? (
          <IndexView open={open} />
        ) : entry ? (
          <>
            <BlocksView
              blocks={entry.blocks}
              open={open}
              after={entry.kind === 'section' ? { 'Try this': <TryThisCards entryId={entry.id} items={entry.tryThis} /> } : undefined}
            />
            {entry.presets.length > 0 && (
              <section className="help-presets" aria-label="Presets that show this">
                <h3>Hear it in a preset</h3>
                <ul>
                  {entry.presets.map((pid) => {
                    const p = presetStore.getState().factory.find((f) => f.id === pid);
                    return p ? (
                      <li key={pid}>
                        <button type="button" onClick={() => presetStore.getState().select(pid)}>{p.name}</button>
                      </li>
                    ) : null;
                  })}
                </ul>
              </section>
            )}
            {entry.related.length > 0 && entry.kind === 'control' && (
              <section className="help-related" aria-label="Related entries">
                <h3>Related</h3>
                <ul>
                  {entry.related.map((rid) => (
                    <li key={rid}><button type="button" className="help-link" onClick={() => open(rid)}>{HELP.entries.get(rid)?.title ?? rid}</button></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p>There is no help entry called “{current}”.</p>
        )}
      </div>
    </aside>
  );
}

function IndexView({ open }: { open: (id: string) => void }) {
  const groups = buildIndex();
  return (
    <nav aria-label="Help index">
      <p>Every entry, in the order the sound travels through the synth.</p>
      <ol className="help-index">
        {groups.map((g) => (
          <li key={g.id}>
            <button type="button" className="help-link section-link" onClick={() => open(g.id)}>{HELP.entries.get(g.id)?.title ?? g.id}</button>
            {g.controls.length > 0 && (
              <ul>
                {g.controls.map((c) => (
                  <li key={c.id}><button type="button" className="help-link" onClick={() => open(c.id)}>{HELP.entries.get(c.id)?.title ?? c.label}</button></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
