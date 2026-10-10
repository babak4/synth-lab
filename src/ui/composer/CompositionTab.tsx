import './composer.css';
import { TrackList } from './tracks/TrackList';

/** The Composition tab body: track list and arrangement overview, then the piano roll slot. */
export function CompositionTab() {
  return (
    <div className="composition">
      <TrackList />
      {/* PIANO ROLL SLOT (T5.3a): replace the next line with <PianoRoll /> */}
      <p className="placeholder piano-roll-slot" data-testid="piano-roll-slot">The piano roll appears here.</p>
    </div>
  );
}
