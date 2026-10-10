/** Pitch helpers shared by audio, keyboard and visualisers. MIDI C4 = 60, A4 = 69. */

/** MIDI note number → Hz. */
export const mtof = (pitch: number, a4 = 440): number => a4 * 2 ** ((pitch - 69) / 12);

/** Hz → fractional MIDI note number. */
export const ftom = (hz: number, a4 = 440): number => 69 + 12 * Math.log2(hz / a4);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 60 → "C4", 61 → "C#4". */
export function noteName(pitch: number): string {
  const p = Math.round(pitch);
  return `${NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
}

export const isBlackKey = (pitch: number): boolean => [1, 3, 6, 8, 10].includes(((Math.round(pitch) % 12) + 12) % 12);
