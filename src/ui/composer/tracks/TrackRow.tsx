import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { MAX_TRACKS, type Project, type Track } from '@/core/contracts/project';
import { TrackFader } from './TrackFader';
import { TrackOverview } from './TrackOverview';

export interface TrackRowHandle {
  focusMove(direction: -1 | 1): void;
}

interface Props {
  track: Track;
  index: number;
  count: number;
  project: Pick<Project, 'lengthBars' | 'timeSignature'>;
  selected: boolean;
  actions: {
    select(id: string): void;
    rename(id: string, name: string): void;
    volume(id: string, db: number): void;
    mute(id: string, on: boolean): void;
    solo(id: string, on: boolean): void;
    move(id: string, direction: -1 | 1): void;
    duplicate(id: string): void;
    remove(id: string): void;
  };
}

function NameField({ track, onRename }: { track: Track; onRename: (name: string) => void }) {
  // null = not editing: show the stored name, so outside renames never need syncing.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const trimmed = (draft ?? track.name).trim();
    if (trimmed && trimmed !== track.name) onRename(trimmed);
    setDraft(null);
  };
  return (
    <input
      type="text"
      className="track-name"
      aria-label={`Name of ${track.name}`}
      value={draft ?? track.name}
      maxLength={40}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export const TrackRow = forwardRef<TrackRowHandle, Props>(function TrackRow(
  { track, index, count, project, selected, actions },
  ref,
) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    focusMove(direction) {
      // Keep focus on the button just used; at the end of the list fall back to its partner.
      const first = direction === -1 ? up.current : down.current;
      const other = direction === -1 ? down.current : up.current;
      (first && !first.disabled ? first : other)?.focus();
    },
  }));
  const { id, name } = track;
  return (
    <li
      className={`track-row${selected ? ' selected' : ''}`}
      data-testid="track-row"
      data-track-id={id}
      aria-current={selected ? 'true' : undefined}
      style={{ ['--track' as string]: track.colour }}
    >
      <div className="track-head" role="group" aria-label={`${name}, track ${index + 1} of ${count}`}>
        <button
          type="button"
          className="track-select"
          aria-pressed={selected}
          aria-label={`Select ${name}`}
          onClick={() => actions.select(id)}
        >
          <span className="swatch" aria-hidden="true" />
        </button>
        <NameField track={track} onRename={(n) => actions.rename(id, n)} />
        <TrackFader trackName={name} value={track.volumeDb} onChange={(db) => actions.volume(id, db)} />
        <button type="button" className="track-btn" aria-pressed={track.mute} aria-label={`Mute ${name}`} title="Mute" onClick={() => actions.mute(id, !track.mute)}>
          M
        </button>
        <button type="button" className="track-btn" aria-pressed={track.solo} aria-label={`Solo ${name}`} title="Solo" onClick={() => actions.solo(id, !track.solo)}>
          S
        </button>
        <span className="track-tools">
          <button ref={up} type="button" className="track-btn" aria-label={`Move ${name} up`} title="Move up" disabled={index === 0} onClick={() => actions.move(id, -1)}>
            ↑
          </button>
          <button ref={down} type="button" className="track-btn" aria-label={`Move ${name} down`} title="Move down" disabled={index === count - 1} onClick={() => actions.move(id, 1)}>
            ↓
          </button>
          <button
            type="button"
            className="track-btn"
            aria-label={`Duplicate ${name}`}
            title={count >= MAX_TRACKS ? `At the ${MAX_TRACKS}-track limit` : 'Duplicate'}
            disabled={count >= MAX_TRACKS}
            onClick={() => actions.duplicate(id)}
          >
            ⧉
          </button>
          <button type="button" className="track-btn" aria-label={`Delete ${name}`} title={count <= 1 ? 'A project needs at least one track' : 'Delete'} disabled={count <= 1} onClick={() => actions.remove(id)}>
            ✕
          </button>
        </span>
      </div>
      <TrackOverview track={track} project={project} selected={selected} onSelect={() => actions.select(id)} />
    </li>
  );
});
