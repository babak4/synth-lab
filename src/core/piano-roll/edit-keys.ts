/**
 * Keyboard model of the piano roll's editing (plan T5.3b). Pure: a key event plus a little context
 * becomes an action, or null to let the view keys (arrows scroll, + - zoom …) have it.
 *
 *   Selection present   Up/Down transpose ±1 (Shift ±12); Left/Right nudge by the grid step (Shift: a beat)
 *   Cursor active       Up/Down move the cursor by a pitch (Shift: an octave); Left/Right by the grid step (Shift: a beat)
 *   Neither             arrows scroll the view (the original behaviour)
 *   Enter               with no cursor: start keyboard entry (place the cursor); with a cursor: add a note there,
 *                       or select/deselect the note already there
 *   Delete / Backspace  delete the selection (or, with only a cursor, the note under it)
 *   Ctrl/Cmd+A          select all      Esc  deselect, then leave keyboard entry
 *   Ctrl/Cmd+D          duplicate       Ctrl/Cmd+C / X / V   copy / cut / paste at the playhead
 */
export interface EditKeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface EditKeyContext {
  hasSelection: boolean;
  cursorActive: boolean;
}

export type EditAction =
  | { kind: 'transpose'; semitones: number }
  | { kind: 'nudge'; direction: -1 | 1; big: boolean }
  | { kind: 'cursor'; dPitch: number; dSteps: number; big: boolean }
  | { kind: 'enter' }
  | { kind: 'delete' }
  | { kind: 'selectAll' }
  | { kind: 'deselect' }
  | { kind: 'duplicate' }
  | { kind: 'copy' }
  | { kind: 'cut' }
  | { kind: 'paste' };

export function interpretEditKey(e: EditKeyLike, ctx: EditKeyContext): EditAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    if (e.shiftKey) return null; // Shift+Ctrl+Z and friends belong to the app
    switch (e.key.toLowerCase()) {
      case 'a': return { kind: 'selectAll' };
      case 'd': return { kind: 'duplicate' };
      case 'c': return { kind: 'copy' };
      case 'x': return { kind: 'cut' };
      case 'v': return { kind: 'paste' };
      default: return null;
    }
  }
  if (mod || e.altKey) return null;

  switch (e.key) {
    case 'Enter': return { kind: 'enter' };
    case 'Delete':
    case 'Backspace': return ctx.hasSelection || ctx.cursorActive ? { kind: 'delete' } : null;
    case 'Escape': return ctx.hasSelection || ctx.cursorActive ? { kind: 'deselect' } : null;
    case 'ArrowUp':
    case 'ArrowDown': {
      const up = e.key === 'ArrowUp';
      const amount = (e.shiftKey ? 12 : 1) * (up ? 1 : -1);
      if (ctx.hasSelection) return { kind: 'transpose', semitones: amount };
      return ctx.cursorActive ? { kind: 'cursor', dPitch: amount, dSteps: 0, big: false } : null;
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (ctx.hasSelection) return { kind: 'nudge', direction: dir, big: e.shiftKey };
      return ctx.cursorActive ? { kind: 'cursor', dPitch: 0, dSteps: dir, big: e.shiftKey } : null;
    }
    default: return null;
  }
}
