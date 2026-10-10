/** 24×14 waveform glyphs for the Segmented control. Decorative: the option label carries the name. */
const PATHS: Record<string, string> = {
  sine: 'M1 7 C4 -1 8 -1 12 7 S20 15 23 7',
  triangle: 'M1 7 L6 1.5 L12 12.5 L18 1.5 L23 7',
  sawtooth: 'M1 12 L12 2 L12 12 L23 2',
  square: 'M1 12 V2 H12 V12 H23 V2',
  pulse: 'M1 12 V2 H7 V12 H16 V2 H23',
  'sample-hold': 'M1 9 H5 V3 H9 V11 H13 V6 H17 V12 H23',
  off: 'M2 7 H22',
};

export function WaveIcon({ shape }: { shape: string }) {
  const d = PATHS[shape];
  if (!d) return null;
  return (
    <svg className="wave-icon" width="24" height="14" viewBox="0 0 24 14" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
