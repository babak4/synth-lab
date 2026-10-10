/** Output meter ballistics (plan T2.3): instant attack, steady fall, peak hold, latched clip. */
import { toDb } from '../db';

export interface MeterState {
  /** Displayed level in dBFS. */
  levelDb: number;
  /** Peak-hold marker in dBFS. */
  holdDb: number;
  /** Time (s) the peak marker has been held. */
  holdAge: number;
}

export const METER_FLOOR_DB = -60;
/** Fall rate of the bar. */
export const FALL_DB_PER_S = 24;
export const HOLD_SECONDS = 1.2;

export const initialMeter = (): MeterState => ({ levelDb: METER_FLOOR_DB, holdDb: METER_FLOOR_DB, holdAge: 0 });

export function stepMeter(prev: MeterState, linearPeak: number, dt: number): MeterState {
  const inDb = Math.max(METER_FLOOR_DB, toDb(linearPeak));
  const levelDb = inDb >= prev.levelDb ? inDb : Math.max(inDb, prev.levelDb - FALL_DB_PER_S * dt);
  let { holdDb, holdAge } = prev;
  if (inDb >= holdDb) {
    holdDb = inDb;
    holdAge = 0;
  } else {
    holdAge += dt;
    if (holdAge > HOLD_SECONDS) holdDb = Math.max(levelDb, holdDb - FALL_DB_PER_S * dt);
  }
  return { levelDb, holdDb, holdAge };
}

/** dBFS → 0–1 bar height. */
export const meterFraction = (db: number): number => Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
