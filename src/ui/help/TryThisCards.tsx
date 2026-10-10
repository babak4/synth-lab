import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import type { TryThis } from '@/content/schema';

/** "Set it up", "A/B" and "Undo" for each experiment of a section entry (plan T4.3). */
export function TryThisCards({ entryId, items }: { entryId: string; items: TryThis[] }) {
  const { tryThisStore } = useServices();
  const s = useStore(tryThisStore);
  if (items.length === 0) return null;
  return (
    <div className="trythis">
      {items.map((t, i) => {
        const key = `${entryId}#${i}`;
        const active = s.active === key;
        return (
          <article key={key} className={`trythis-card${active ? ' active' : ''}`} aria-label={`Experiment: ${t.title}`}>
            <h4>{t.title}</h4>
            <p>{t.description}</p>
            <div className="trythis-actions">
              <button type="button" onClick={() => s.setUp(entryId, i, t)}>Set it up</button>
              {active && (
                <>
                  <button type="button" onClick={() => s.toggle()} aria-label={`A/B: now hearing ${s.showing === 'B' ? 'the experiment (B)' : 'your sound from before (A)'}`}>
                    A/B <span className="ab-state" aria-hidden="true">{s.showing}</span>
                  </button>
                  <button type="button" onClick={() => s.play()}>Play note</button>
                  <button type="button" onClick={() => s.undo()}>Undo</button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
