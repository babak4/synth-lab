import { useApp, useNotes, useServices } from '@/app/context';
import { noteName } from '@/core/pitch';
import { HelpButton, Slider } from '../components';
import { Zone } from '../Zones';
import { ScreenKeyboard } from './ScreenKeyboard';

/** Held notes (or the last one played) above the keys, supporting the lessons on pitch (PRD §5.3). */
function NoteReadout() {
  const held = useNotes((s) => s.held);
  const last = useNotes((s) => s.last);
  const names = [...held.keys()].sort((a, b) => a - b).map(noteName);
  return (
    <output className="note-readout" aria-label="Notes playing" data-testid="note-readout" data-playing={names.length > 0}>
      {names.length > 0 ? names.join(' ') : last !== null ? noteName(last) : '–'}
    </output>
  );
}

function LiveIndicator() {
  const live = useApp((s) => s.keyboardLive);
  return (
    <span className={`kb-live${live ? ' on' : ''}`} data-live={live} role="status">
      <span className="kb-led" aria-hidden="true" />
      {live ? 'Keyboard live: play with your computer keys' : 'Click the page to play with your computer keys'}
    </span>
  );
}

export function KeyboardZone() {
  const { appStore, bus, host } = useServices();
  const octave = useApp((s) => s.kbdOctave);
  const velocity = useApp((s) => s.kbdVelocity);
  return (
    <Zone title="Keyboard" id="keyboard">
      <div className="kb-controls">
        <LiveIndicator />
        <NoteReadout />
        <Slider id="kbd-octave" value={octave} onChange={(v) => appStore.getState().setGlobal('kbd-octave', v)} noHelp />
        <Slider id="kbd-velocity" value={velocity} onChange={(v) => appStore.getState().setGlobal('kbd-velocity', v)} noHelp />
        <HelpButton helpId="keyboard" label="Keyboard" />
        <button type="button" className="panic-btn" onClick={() => bus.emit('panic', { audioTime: host.currentTime })}>
          All notes off
        </button>
      </div>
      <ScreenKeyboard />
    </Zone>
  );
}
