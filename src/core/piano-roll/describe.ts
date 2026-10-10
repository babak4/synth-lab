/**
 * Plain-language descriptions of notes and positions for the piano roll's live status region
 * (plan T5.3b). Pure, so the wording is unit-tested.
 */
import { ticksPerBar, type Note, type TimeSignature } from '../contracts/project';
import { noteName } from '../pitch';
import { beatTicks } from './grid';
import { describeLength } from './snap';

/** "bar 2, beat 3", with "plus 120 ticks" when the position is off the beat. Bars and beats count from 1. */
export function describePosition(tick: number, sig: TimeSignature): string {
  const t = Math.max(0, Math.round(tick));
  const bar = ticksPerBar(sig);
  const beat = beatTicks(sig);
  const inBar = t % bar;
  const rest = inBar % beat;
  const text = `bar ${Math.floor(t / bar) + 1}, beat ${Math.floor(inBar / beat) + 1}`;
  return rest === 0 ? text : `${text} plus ${rest} ${rest === 1 ? 'tick' : 'ticks'}`;
}

/** "C4 quarter note at bar 1, beat 1". */
export function describeNote(n: Pick<Note, 'pitch' | 'start' | 'duration'>, sig: TimeSignature): string {
  return `${noteName(n.pitch)} ${describeLength(n.duration)} at ${describePosition(n.start, sig)}`;
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "1 note" / "3 notes". */
export const countNotes = (n: number): string => plural(n, 'note');
