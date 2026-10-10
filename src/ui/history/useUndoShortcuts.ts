import { useEffect } from 'react';
import { useServices } from '@/app/context';
import { isTypingTarget } from '../keyboard/keyboard-player';

/**
 * Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redoes. Inside a text field the browser's own undo
 * for that field is left alone. The end of a pointer or key gesture closes the current undo step, so
 * one drag is one step but two separate drags are two.
 */
export function useUndoShortcuts(): void {
  const { historyStore } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) historyStore.getState().redo();
        else historyStore.getState().undo();
      } else if (key === 'y' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        historyStore.getState().redo();
      }
    };
    const end = () => historyStore.getState().endGesture();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('keyup', end, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('keyup', end, true);
    };
  }, [historyStore]);
}
