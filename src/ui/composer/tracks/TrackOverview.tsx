import { useMemo } from 'react';
import { barLines, layoutMiniNotes } from '@/core/arrangement';
import { ticksPerBar, type Project, type Track } from '@/core/contracts/project';

interface Props {
  track: Track;
  project: Pick<Project, 'lengthBars' | 'timeSignature'>;
  selected: boolean;
  onSelect: () => void;
}

/** One track's notes in miniature along the whole project length. Clicking it selects the track. */
export function TrackOverview({ track, project, selected, onSelect }: Props) {
  const { lengthBars, timeSignature } = project;
  const total = lengthBars * ticksPerBar(timeSignature);
  const minis = useMemo(() => layoutMiniNotes(track.notes, total), [track.notes, total]);
  const lines = useMemo(() => barLines(lengthBars), [lengthBars]);
  const count = track.notes.length;
  return (
    <button
      type="button"
      className="track-overview"
      data-testid="track-overview"
      aria-pressed={selected}
      aria-label={`Select ${track.name}: ${count} ${count === 1 ? 'note' : 'notes'} over ${lengthBars} bars`}
      onClick={onSelect}
      style={{ ['--track' as string]: track.colour }}
    >
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {lines.map((x) => (
          <line key={x} className="bar-line" x1={x * 1000} x2={x * 1000} y1={0} y2={100} vectorEffect="non-scaling-stroke" />
        ))}
        {minis.map((m, i) => (
          <rect key={i} className="mini-note" x={m.x * 1000} y={m.y * 100} width={m.w * 1000} height={Math.max(m.h * 100, 3)} />
        ))}
      </svg>
    </button>
  );
}
