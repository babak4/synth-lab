/** Tempo-sync maths shared by the LFO and the delay. Pure. */

export type Division = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32';

/** Length of a division in quarter-note beats: 1/1 = 4 beats … 1/32 = 0.125 beats. */
export function divisionBeats(division: Division): number {
  return 4 / Number(division.split('/')[1]);
}

/** Frequency (Hz) of one LFO cycle per `division` at `bpm`. */
export function syncedRateHz(bpm: number, division: Division): number {
  return bpm / 60 / divisionBeats(division);
}

/** Duration (s) of `division` at `bpm`, e.g. for a synced delay. */
export function syncedSeconds(bpm: number, division: Division): number {
  return (60 / bpm) * divisionBeats(division);
}

export interface RateSettings {
  sync: boolean;
  rateHz: number;
  division: Division;
  bpm: number;
}

export function effectiveRateHz(s: RateSettings): number {
  return s.sync ? syncedRateHz(s.bpm, s.division) : s.rateHz;
}
