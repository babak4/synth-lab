import { useStore } from 'zustand';
import { useServices } from '@/app/context';

/**
 * Visually hidden polite live region for the piano roll's messages. A screen reader announces a live
 * region only when its text changes, so an identical message twice in a row ("Already at the highest
 * pitch") would stay silent the second time. Every message bumps `statusSeq`; odd ones get a zero-width
 * space on the end, which changes the text without changing what is read.
 */
export function StatusRegion() {
  const { pianoRollEdit } = useServices();
  const status = useStore(pianoRollEdit, (s) => s.status);
  const seq = useStore(pianoRollEdit, (s) => s.statusSeq);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden" data-testid="piano-roll-status">
      {status}
      {seq % 2 === 1 ? '​' : ''}
    </div>
  );
}
