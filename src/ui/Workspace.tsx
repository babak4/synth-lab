import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { TABS, type TabId } from '@/core/tabs';
import { SynthPanel } from './synth/SynthPanel';
import { PianoRoll } from './composer/piano-roll/PianoRoll';

const tabDomId = (id: TabId) => `tab-${id}`;
const panelDomId = (id: TabId) => `tabpanel-${id}`;

/** WAI-ARIA tabs: arrows move (and select), Home/End jump, only the selected tab is in the tab order. */
export function TabBar() {
  const { tabStore } = useServices();
  const tab = useStore(tabStore, (s) => s.tab);
  const refs = useRef(new Map<TabId, HTMLButtonElement>());

  const go = (i: number) => {
    const next = TABS[(i + TABS.length) % TABS.length]!;
    tabStore.getState().select(next.id);
    refs.current.get(next.id)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const key = e.key;
    if (key === 'ArrowRight') go(i + 1);
    else if (key === 'ArrowLeft') go(i - 1);
    else if (key === 'Home') go(0);
    else if (key === 'End') go(TABS.length - 1);
    else return;
    e.preventDefault();
    e.stopPropagation(); // arrows belong to the tabs here, not to the keyboard player
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Synth sections" onKeyDown={onKeyDown} data-arrow-owner>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            if (el) refs.current.set(t.id, el);
          }}
          type="button"
          role="tab"
          id={tabDomId(t.id)}
          aria-selected={t.id === tab}
          aria-controls={panelDomId(t.id)}
          tabIndex={t.id === tab ? 0 : -1}
          className="tab"
          onClick={() => tabStore.getState().select(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Only the selected tab is mounted, so canvases in hidden tabs are not drawn at all. */
export function TabPanel(): ReactNode {
  const { tabStore } = useServices();
  const tab = useStore(tabStore, (s) => s.tab);
  return (
    <main className="app-main" role="tabpanel" id={panelDomId(tab)} aria-labelledby={tabDomId(tab)} data-tab={tab}>
      {tab === 'composition' ? (
        <PianoRoll />
      ) : (
        <SynthPanel tab={tab} />
      )}
    </main>
  );
}
