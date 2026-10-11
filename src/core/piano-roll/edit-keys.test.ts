import { describe, expect, it } from 'vitest';
import { interpretEditKey, type EditKeyContext, type EditKeyLike } from './edit-keys';
import { interpretKey } from './input';

const key = (k: string, mods: Partial<EditKeyLike> = {}): EditKeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const none: EditKeyContext = { hasSelection: false, cursorActive: false };
const sel: EditKeyContext = { hasSelection: true, cursorActive: false };
const cur: EditKeyContext = { hasSelection: false, cursorActive: true };

describe('arrows', () => {
  it('with a selection: up/down transpose by 1, Shift by an octave', () => {
    expect(interpretEditKey(key('ArrowUp'), sel)).toEqual({ kind: 'transpose', semitones: 1 });
    expect(interpretEditKey(key('ArrowDown'), sel)).toEqual({ kind: 'transpose', semitones: -1 });
    expect(interpretEditKey(key('ArrowUp', { shiftKey: true }), sel)).toEqual({ kind: 'transpose', semitones: 12 });
    expect(interpretEditKey(key('ArrowDown', { shiftKey: true }), sel)).toEqual({ kind: 'transpose', semitones: -12 });
  });

  it('with a selection: left/right nudge by the grid step, Shift by a beat', () => {
    expect(interpretEditKey(key('ArrowRight'), sel)).toEqual({ kind: 'nudge', direction: 1, big: false });
    expect(interpretEditKey(key('ArrowLeft', { shiftKey: true }), sel)).toEqual({ kind: 'nudge', direction: -1, big: true });
  });

  it('a selection wins over the cursor', () => {
    expect(interpretEditKey(key('ArrowUp'), { hasSelection: true, cursorActive: true })).toEqual({ kind: 'transpose', semitones: 1 });
  });

  it('with only a cursor: arrows move the cursor', () => {
    expect(interpretEditKey(key('ArrowUp'), cur)).toEqual({ kind: 'cursor', dPitch: 1, dSteps: 0, big: false });
    expect(interpretEditKey(key('ArrowDown', { shiftKey: true }), cur)).toEqual({ kind: 'cursor', dPitch: -12, dSteps: 0, big: false });
    expect(interpretEditKey(key('ArrowLeft'), cur)).toEqual({ kind: 'cursor', dPitch: 0, dSteps: -1, big: false });
    expect(interpretEditKey(key('ArrowRight', { shiftKey: true }), cur)).toEqual({ kind: 'cursor', dPitch: 0, dSteps: 1, big: true });
  });

  it('with neither: arrows are left to the view, which scrolls', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(interpretEditKey(key(k), none)).toBeNull();
      expect(interpretKey(key(k), { width: 800, height: 400 })).not.toBeNull();
    }
  });

  it('Alt+arrow is left to the browser', () => {
    expect(interpretEditKey(key('ArrowLeft', { altKey: true }), sel)).toBeNull();
  });
});

describe('editing keys', () => {
  it('Delete and Backspace delete the selection, or the note under the cursor; otherwise nothing', () => {
    expect(interpretEditKey(key('Delete'), sel)).toEqual({ kind: 'delete' });
    expect(interpretEditKey(key('Backspace'), cur)).toEqual({ kind: 'delete' });
    expect(interpretEditKey(key('Backspace'), none)).toBeNull();
  });

  it('Ctrl or Cmd with A / D / C / X / V', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(interpretEditKey(key('a', mod), none)).toEqual({ kind: 'selectAll' });
      expect(interpretEditKey(key('d', mod), sel)).toEqual({ kind: 'duplicate' });
      expect(interpretEditKey(key('D', mod), sel)).toEqual({ kind: 'duplicate' });
      expect(interpretEditKey(key('c', mod), sel)).toEqual({ kind: 'copy' });
      expect(interpretEditKey(key('x', mod), sel)).toEqual({ kind: 'cut' });
      expect(interpretEditKey(key('v', mod), none)).toEqual({ kind: 'paste' });
    }
  });

  it('plain letters, and undo/redo chords, are not ours', () => {
    expect(interpretEditKey(key('d'), sel)).toBeNull();
    expect(interpretEditKey(key('z', { ctrlKey: true }), sel)).toBeNull();
    expect(interpretEditKey(key('z', { ctrlKey: true, shiftKey: true }), sel)).toBeNull();
    expect(interpretEditKey(key('a', { ctrlKey: true, shiftKey: true }), sel)).toBeNull();
  });

  it('Enter always acts; Escape only when there is something to leave', () => {
    expect(interpretEditKey(key('Enter'), none)).toEqual({ kind: 'enter' });
    expect(interpretEditKey(key('Escape'), sel)).toEqual({ kind: 'deselect' });
    expect(interpretEditKey(key('Escape'), cur)).toEqual({ kind: 'deselect' });
    expect(interpretEditKey(key('Escape'), none)).toBeNull();
  });

  it('view keys fall through', () => {
    for (const k of ['f', '+', '-', '[', ']', 'PageUp']) expect(interpretEditKey(key(k), sel)).toBeNull();
  });
});
