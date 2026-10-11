/**
 * Laptop keyboard → note events (PRD §5, plan T3.1).
 *
 * Emits events on the bus only; app/note-router.ts decides which engine plays them. Pitches are decided
 * at key-down and remembered per physical key, so a key-up always releases exactly what its key-down
 * started, even if the octave changed or focus moved in between.
 */
import type { EventBus, EventMap } from '@/core/contracts/events';
import { clampOctave, isHelpKey, pitchForCode, stepVelocity } from '@/core/keyboard';
import type { AppStore } from '@/state/app-store';

export interface KeyboardPlayerDeps {
  bus: EventBus<EventMap>;
  appStore: AppStore;
  /** Audio-clock time in seconds, stamped on events so the recorder can place them. */
  now(): number;
  /** Called on the first note key press; the app uses it to start audio (a key press is a user gesture). */
  onFirstGesture?(): void;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);

/** True where typing should type: text-like inputs, textareas, selects and contenteditable regions. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
}

/** Controls that use the arrow keys themselves; global octave/velocity must leave those alone. */
const ARROW_OWNERS = '[role="slider"], [role="radio"], [role="radiogroup"], [role="spinbutton"], input[type="range"], input[type="number"], select, [data-arrow-owner]';
const isArrowOwner = (el: EventTarget | null): boolean => el instanceof Element && el.closest(ARROW_OWNERS) !== null;

export class KeyboardPlayer {
  /** Physical key (code) → pitch it started. */
  private readonly down = new Map<string, number>();
  /** How many keys currently hold each pitch (the manuals overlap, so two keys can make one note). */
  private readonly holders = new Map<number, number>();
  private readonly shifts = new Set<string>();
  private sustain = false;
  private gestured = false;

  constructor(private readonly d: KeyboardPlayerDeps) {}

  get heldPitches(): number[] {
    return [...this.holders.keys()].sort((a, b) => a - b);
  }

  /** Listen on `win` until the returned function is called. */
  attach(win: Window = window): () => void {
    const live = () => this.d.appStore.getState().setKeyboardLive(win.document.hasFocus() && !isTypingTarget(win.document.activeElement));
    const onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.keyUp(e);
    const onBlur = () => {
      this.releaseAll();
      live();
    };
    const onVisibility = () => win.document.hidden && this.releaseAll();
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    win.addEventListener('focus', live);
    win.addEventListener('focusin', live);
    win.addEventListener('focusout', live);
    win.document.addEventListener('visibilitychange', onVisibility);
    live();
    return () => {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', live);
      win.removeEventListener('focusin', live);
      win.removeEventListener('focusout', live);
      win.document.removeEventListener('visibilitychange', onVisibility);
      this.releaseAll();
    };
  }

  keyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser / OS shortcuts

    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      // Shift means something else on the piano roll (extend the selection, octave transpose), and a held
      // sustain would keep its audition notes ringing until Shift is released.
      if (e.target instanceof Element && e.target.closest('[data-no-shift-sustain]')) return;
      this.shifts.add(e.code);
      this.setSustain(true);
      return;
    }
    if (e.code === 'Escape') {
      if (!e.repeat) this.panic();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      if (isArrowOwner(e.target)) return;
      e.preventDefault();
      const s = this.d.appStore.getState();
      if (e.code === 'ArrowLeft') s.setGlobal('kbd-octave', clampOctave(s.kbdOctave - 1));
      else if (e.code === 'ArrowRight') s.setGlobal('kbd-octave', clampOctave(s.kbdOctave + 1));
      else s.setGlobal('kbd-velocity', stepVelocity(s.kbdVelocity, e.code === 'ArrowUp' ? 1 : -1));
      return;
    }
    // "?" asks for help on the focused control; it must never play a note.
    if (isHelpKey(e)) return;

    const pitch = pitchForCode(e.code, this.d.appStore.getState().kbdOctave);
    if (pitch === null) return;
    e.preventDefault(); // stop "/" opening quick-find, space-like scrolling, etc.
    if (e.repeat || this.down.has(e.code)) return; // a held key is one note

    if (!this.gestured) {
      this.gestured = true;
      this.d.onFirstGesture?.();
    }
    this.down.set(e.code, pitch);
    const n = (this.holders.get(pitch) ?? 0) + 1;
    this.holders.set(pitch, n);
    if (n === 1) this.d.bus.emit('note:on', { pitch, velocity: this.d.appStore.getState().kbdVelocity, source: 'keyboard', audioTime: this.d.now() });
  }

  /** Key-up is never gated: whatever a key started, its release must finish. */
  keyUp(e: KeyboardEvent): void {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.shifts.delete(e.code);
      if (this.shifts.size === 0) this.setSustain(false);
      return;
    }
    const pitch = this.down.get(e.code);
    if (pitch === undefined) return;
    this.down.delete(e.code);
    this.release(pitch);
  }

  /** Release everything this player is holding (window blur, tab hidden, detach). Notes end naturally. */
  releaseAll(): void {
    for (const pitch of [...this.holders.keys()]) {
      this.holders.delete(pitch);
      this.d.bus.emit('note:off', { pitch, source: 'keyboard', audioTime: this.d.now() });
    }
    this.down.clear();
    this.shifts.clear();
    this.setSustain(false);
  }

  /** Esc: stop every sound immediately, including ringing releases. */
  panic(): void {
    this.down.clear();
    this.holders.clear();
    this.shifts.clear();
    this.sustain = false;
    this.d.bus.emit('panic', { audioTime: this.d.now() });
  }

  private release(pitch: number): void {
    const n = (this.holders.get(pitch) ?? 1) - 1;
    if (n > 0) this.holders.set(pitch, n);
    else {
      this.holders.delete(pitch);
      this.d.bus.emit('note:off', { pitch, source: 'keyboard', audioTime: this.d.now() });
    }
  }

  private setSustain(down: boolean): void {
    if (down === this.sustain) return;
    this.sustain = down;
    this.d.bus.emit('sustain', { down, source: 'keyboard', audioTime: this.d.now() });
  }
}
