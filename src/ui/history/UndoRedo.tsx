import { useStore } from 'zustand';
import { useServices } from '@/app/context';

/** Undo and Redo buttons. Their names say what they would undo or redo, for screen readers and tooltips. */
export function UndoRedo() {
  const { historyStore } = useServices();
  const h = useStore(historyStore);
  return (
    <div className="undo-redo" role="group" aria-label="History">
      <button
        type="button"
        onClick={() => h.undo()}
        disabled={!h.canUndo}
        aria-label={h.canUndo ? `Undo: ${h.undoLabel}` : 'Undo'}
        title={h.canUndo ? `Undo: ${h.undoLabel} (Ctrl/Cmd+Z)` : 'Nothing to undo'}
      >
        ↶
      </button>
      <button
        type="button"
        onClick={() => h.redo()}
        disabled={!h.canRedo}
        aria-label={h.canRedo ? `Redo: ${h.redoLabel}` : 'Redo'}
        title={h.canRedo ? `Redo: ${h.redoLabel} (Shift+Ctrl/Cmd+Z)` : 'Nothing to redo'}
      >
        ↷
      </button>
    </div>
  );
}
