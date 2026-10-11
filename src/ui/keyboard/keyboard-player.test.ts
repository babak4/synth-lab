// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventBus, type EventMap } from '@/core/contracts/events';
import { createAppStore } from '@/state/app-store';
import { KeyboardPlayer, isTypingTarget } from './keyboard-player';

type Logged = { type: string; pitch?: number; velocity?: number; down?: boolean };
let bus: EventBus<EventMap>;
let log: Logged[];
let appStore: ReturnType<typeof createAppStore>;
let player: KeyboardPlayer;
let detach: () => void;
let onFirstGesture: Mock<() => void>;

beforeEach(() => {
  bus = new EventBus<EventMap>();
  log = [];
  bus.on('note:on', (e) => log.push({ type: 'on', pitch: e.pitch, velocity: e.velocity }));
  bus.on('note:off', (e) => log.push({ type: 'off', pitch: e.pitch }));
  bus.on('sustain', (e) => log.push({ type: 'sustain', down: e.down }));
  bus.on('panic', () => log.push({ type: 'panic' }));
  appStore = createAppStore();
  onFirstGesture = vi.fn<() => void>();
  player = new KeyboardPlayer({ bus, appStore, now: () => 1.5, onFirstGesture });
  detach = player.attach(window);
});
afterEach(() => {
  detach();
  document.body.innerHTML = '';
});

const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent(type, { code, key: init.key ?? code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const press = (code: string, init?: KeyboardEventInit, target?: EventTarget) => key('keydown', code, init, target);
const release = (code: string, init?: KeyboardEventInit, target?: EventTarget) => key('keyup', code, init, target);

describe('playing notes', () => {
  it('a key down is a note on at the key’s pitch and the keyboard velocity; key up is the note off', () => {
    press('KeyQ');
    release('KeyQ');
    expect(log).toEqual([{ type: 'on', pitch: 60, velocity: 96 }, { type: 'off', pitch: 60 }]);
  });

  it('stamps events with the audio clock', () => {
    let t = 0;
    bus.on('note:on', (e) => (t = e.audioTime));
    press('KeyZ');
    expect(t).toBe(1.5);
  });

  it('ignores auto-repeat: a held key is one note', () => {
    press('KeyZ');
    press('KeyZ', { repeat: true });
    press('KeyZ', { repeat: true });
    press('KeyZ');
    expect(log.filter((l) => l.type === 'on').length).toBe(1);
  });

  it('plays chords and releases each key independently', () => {
    press('KeyZ');
    press('KeyC');
    press('KeyB');
    release('KeyC');
    expect(player.heldPitches).toEqual([48, 55]);
    expect(log.at(-1)).toEqual({ type: 'off', pitch: 52 });
  });

  it('prevents the browser default on note keys (so "/" does not open quick-find)', () => {
    expect(press('Slash').defaultPrevented).toBe(true);
  });

  it('ignores keys that are not notes and leaves their defaults alone', () => {
    const e = press('KeyA');
    expect(log).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
    press('Space');
    press('Tab');
    expect(log).toEqual([]);
  });

  it('does not play with Ctrl, Cmd or Alt held (browser shortcuts)', () => {
    press('KeyZ', { ctrlKey: true });
    press('KeyZ', { metaKey: true });
    press('KeyZ', { altKey: true });
    expect(log).toEqual([]);
  });

  it('starts audio on the first note only (a key press is a user gesture)', () => {
    press('ArrowLeft');
    expect(onFirstGesture).not.toHaveBeenCalled();
    press('KeyZ');
    release('KeyZ');
    press('KeyX');
    expect(onFirstGesture).toHaveBeenCalledTimes(1);
  });
});

describe('physical key positions, whatever the layout (PRD §5.3)', () => {
  it('the same key code plays the same pitch whatever character it types', () => {
    // On AZERTY the key at the QWERTY "Q" position types "a"; on QWERTZ the "Z" position types "y".
    press('KeyQ', { key: 'a' });
    press('KeyZ', { key: 'w' });
    expect(log.map((l) => l.pitch)).toEqual([60, 48]);
  });
});

describe('overlapping manuals', () => {
  it('two keys making the same pitch sound it once, and it ends only when both are up', () => {
    press('Comma'); // C4 on the lower manual
    press('KeyQ'); // C4 on the upper manual
    expect(log.filter((l) => l.type === 'on').length).toBe(1);
    release('Comma');
    expect(log.filter((l) => l.type === 'off').length).toBe(0);
    release('KeyQ');
    expect(log.filter((l) => l.type === 'off').length).toBe(1);
  });
});

describe('octave and velocity (PRD §5.2)', () => {
  it('← / → shift the octave, clamped, and the new octave applies to the next notes', () => {
    press('ArrowRight');
    expect(appStore.getState().kbdOctave).toBe(1);
    press('KeyZ');
    expect(log.at(-1)).toEqual({ type: 'on', pitch: 60, velocity: 96 });
    for (let i = 0; i < 10; i++) press('ArrowRight');
    expect(appStore.getState().kbdOctave).toBe(2);
    for (let i = 0; i < 10; i++) press('ArrowLeft');
    expect(appStore.getState().kbdOctave).toBe(-3);
  });

  it('a note released after the octave changed still ends the pitch it started', () => {
    press('KeyZ'); // C3 (48) at octave 0
    press('ArrowRight');
    press('ArrowRight');
    release('KeyZ');
    expect(log).toEqual([{ type: 'on', pitch: 48, velocity: 96 }, { type: 'off', pitch: 48 }]);
  });

  it('↑ / ↓ step velocity by 16 within 1–127', () => {
    press('ArrowUp');
    expect(appStore.getState().kbdVelocity).toBe(112);
    press('ArrowDown');
    press('ArrowDown');
    expect(appStore.getState().kbdVelocity).toBe(80);
    for (let i = 0; i < 20; i++) press('ArrowDown');
    expect(appStore.getState().kbdVelocity).toBe(1);
    press('KeyZ');
    expect(log.at(-1)).toMatchObject({ type: 'on', velocity: 1 });
  });

  it('arrow keys are left to a focused slider, radio group or select', () => {
    for (const html of ['<div role="slider" tabindex="0"></div>', '<button role="radio" aria-checked="true"></button>', '<input type="range">', '<select><option>a</option></select>']) {
      document.body.innerHTML = html;
      const el = document.body.firstElementChild!;
      press('ArrowRight', {}, el);
      press('ArrowUp', {}, el);
    }
    expect(appStore.getState().kbdOctave).toBe(0);
    expect(appStore.getState().kbdVelocity).toBe(96);
  });

  it('but letter keys on a focused slider still play (knobs do not use them)', () => {
    document.body.innerHTML = '<div role="slider" tabindex="0"></div>';
    press('KeyZ', {}, document.body.firstElementChild!);
    expect(log.length).toBe(1);
  });
});

describe('Shift sustain is off inside the piano roll', () => {
  it('Shift on a region marked data-no-shift-sustain is not a sustain pedal; anywhere else it still is', () => {
    const roll = document.createElement('div');
    roll.setAttribute('data-no-shift-sustain', '');
    roll.tabIndex = 0;
    document.body.append(roll);
    press('ShiftLeft', undefined, roll);
    release('ShiftLeft', undefined, roll);
    expect(log).toEqual([]);
    press('ShiftLeft');
    release('ShiftLeft');
    expect(log).toEqual([{ type: 'sustain', down: true }, { type: 'sustain', down: false }]);
  });
});

describe('sustain and panic', () => {
  it('Shift is a sustain pedal, held while either Shift is down', () => {
    press('ShiftLeft');
    press('ShiftRight');
    release('ShiftLeft');
    expect(log).toEqual([{ type: 'sustain', down: true }]);
    release('ShiftRight');
    expect(log).toEqual([{ type: 'sustain', down: true }, { type: 'sustain', down: false }]);
  });

  it('Esc is panic: everything stops and the player forgets what was held', () => {
    press('KeyZ');
    press('KeyC');
    press('Escape');
    expect(log.at(-1)).toEqual({ type: 'panic' });
    expect(player.heldPitches).toEqual([]);
    release('KeyZ'); // late key-ups must not produce stray note-offs
    expect(log.filter((l) => l.type === 'off').length).toBe(0);
  });
});

describe('the "?" key (reserved for help)', () => {
  it('never plays a note, even though it sits on a note key on most layouts', () => {
    press('Slash', { key: '?', shiftKey: true }); // US layout: Shift + /
    press('Comma', { key: '?', shiftKey: true }); // AZERTY layout: Shift + ,
    expect(log.filter((l) => l.type === 'on')).toEqual([]);
    release('Slash', { key: '?' });
    expect(log.filter((l) => l.type === 'off')).toEqual([]);
  });
  it('does not stop a normal "/" from playing', () => {
    press('Slash', { key: '/' });
    expect(log.at(-1)).toMatchObject({ type: 'on', pitch: 64 });
  });
});

describe('typing fields and focus', () => {
  it('does not play while typing in a text field, a number field, a textarea or a select', () => {
    for (const html of ['<input type="text">', '<input type="number">', '<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>']) {
      document.body.innerHTML = html;
      const el = document.body.firstElementChild as HTMLElement;
      // jsdom does not compute isContentEditable; model it the way browsers report it.
      if (el.getAttribute('contenteditable') === 'true') Object.defineProperty(el, 'isContentEditable', { value: true });
      press('KeyZ', {}, el);
    }
    expect(log).toEqual([]);
  });

  it('does play on checkboxes, ranges and buttons', () => {
    for (const html of ['<input type="checkbox">', '<input type="range">', '<button></button>']) {
      document.body.innerHTML = html;
      press('KeyZ', {}, document.body.firstElementChild!);
      release('KeyZ');
    }
    expect(log.filter((l) => l.type === 'on').length).toBe(3);
  });

  it('a key pressed on the page and released inside a text field still ends its note', () => {
    press('KeyZ');
    document.body.innerHTML = '<input type="text">';
    release('KeyZ', {}, document.body.firstElementChild!);
    expect(log.map((l) => l.type)).toEqual(['on', 'off']);
  });

  it('releases every held note and the sustain pedal when the window loses focus', () => {
    press('KeyZ');
    press('KeyC');
    press('ShiftLeft');
    window.dispatchEvent(new Event('blur'));
    expect(log.filter((l) => l.type === 'off').map((l) => l.pitch).sort()).toEqual([48, 52]);
    expect(log.at(-1)).toEqual({ type: 'sustain', down: false });
    expect(player.heldPitches).toEqual([]);
  });

  it('releases everything when the tab is hidden, and when the player is detached', () => {
    press('KeyZ');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    expect(log.filter((l) => l.type === 'off').length).toBe(1);
    press('KeyX');
    detach();
    expect(log.filter((l) => l.type === 'off').length).toBe(2);
    detach = player.attach(window); // for afterEach
  });

  it('ignores an event another handler already claimed (e.g. the help drawer closing on Esc)', () => {
    const claim = (e: Event) => e.preventDefault();
    document.body.addEventListener('keydown', claim);
    press('Escape');
    press('KeyZ');
    document.body.removeEventListener('keydown', claim);
    expect(log).toEqual([]);
  });

  it('isTypingTarget classifies elements', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    const range = document.createElement('input');
    range.type = 'range';
    expect(isTypingTarget(range)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('keyboard live indicator', () => {
  it('follows window focus and whether a text field has focus', () => {
    // jsdom reports hasFocus() according to the document's focus state
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(appStore.getState().keyboardLive).toBe(true);
    document.body.innerHTML = '<input id="t" type="text">';
    (document.getElementById('t') as HTMLInputElement).focus();
    window.dispatchEvent(new Event('focusin'));
    expect(appStore.getState().keyboardLive).toBe(false);
    (document.getElementById('t') as HTMLInputElement).blur();
    window.dispatchEvent(new Event('focusout'));
    expect(appStore.getState().keyboardLive).toBe(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(appStore.getState().keyboardLive).toBe(false);
  });
});
