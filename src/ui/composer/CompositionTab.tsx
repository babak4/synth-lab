import './composer.css';
import { PianoRoll } from './piano-roll/PianoRoll';
import { TrackList } from './tracks/TrackList';

/** The Composition tab body: track list and arrangement overview, then the piano roll. */
export function CompositionTab() {
  return (
    <div className="composition">
      <TrackList />
      <PianoRoll />
    </div>
  );
}
