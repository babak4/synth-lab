/** Decibel conversions. Silence maps to −240 dB rather than −∞ so arithmetic stays finite. */
export const toDb = (linear: number): number => (linear <= 1e-12 ? -240 : 20 * Math.log10(linear));
export const fromDb = (db: number): number => 10 ** (db / 20);
