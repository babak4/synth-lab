import { useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { ADD_DISABLED_REASON, canAddTrack, nudgeIndex } from '@/core/arrangement';
import { MAX_TRACKS } from '@/core/contracts/project';
import { TrackRow, type TrackRowHandle } from './TrackRow';

/** Track headers plus the arrangement overview (plan T5.6). Everything goes through the project store. */
export function TrackList() {
  const { projectStore } = useServices();
  const project = useStore(projectStore, (s) => s.project);
  const selectedId = useStore(projectStore, (s) => s.selectedTrackId);
  const rows = useRef(new Map<string, TrackRowHandle>());
  const list = useRef<HTMLOListElement>(null);
  const pending = useRef<{ id: string; direction: -1 | 1 } | 'list' | null>(null);

  useEffect(() => {
    const p = pending.current;
    pending.current = null;
    if (p === 'list') list.current?.focus();
    else if (p) rows.current.get(p.id)?.focusMove(p.direction);
  }, [project.tracks]);

  const count = project.tracks.length;
  const addable = canAddTrack(count);
  const actions = useMemo(() => {
    const st = () => projectStore.getState();
    return {
      select: (id: string) => st().selectTrack(id),
      rename: (id: string, n: string) => st().renameTrack(id, n),
      volume: (id: string, db: number) => st().setTrackVolume(id, db),
      mute: (id: string, on: boolean) => st().setTrackMute(id, on),
      solo: (id: string, on: boolean) => st().setTrackSolo(id, on),
      move: (id: string, direction: -1 | 1) => {
        const tracks = st().project.tracks;
        const to = nudgeIndex(tracks.findIndex((t) => t.id === id), direction, tracks.length);
        if (to === null) return;
        pending.current = { id, direction };
        st().moveTrack(id, to);
      },
      duplicate: (id: string) => st().duplicateTrack(id),
      remove: (id: string) => {
        pending.current = 'list';
        st().removeTrack(id);
      },
    };
  }, [projectStore]);

  return (
    <section className="track-list" aria-labelledby="track-list-title">
      <div className="track-list-head">
        <h2 id="track-list-title">Tracks</h2>
        <span className="track-count" aria-live="polite">
          {count} of {MAX_TRACKS}
        </span>
        <button
          type="button"
          className="track-add"
          disabled={!addable}
          aria-describedby={addable ? undefined : 'track-add-reason'}
          onClick={() => projectStore.getState().addTrack()}
        >
          Add track
        </button>
        {!addable && (
          <span id="track-add-reason" className="track-add-reason">
            {ADD_DISABLED_REASON}
          </span>
        )}
      </div>
      <ol className="track-rows" ref={list} tabIndex={-1} aria-label="Tracks">
        {project.tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            ref={(h) => {
              if (h) rows.current.set(t.id, h);
              else rows.current.delete(t.id);
            }}
            track={t}
            index={i}
            count={count}
            project={project}
            selected={t.id === selectedId}
            actions={actions}
          />
        ))}
      </ol>
    </section>
  );
}
