import { useStore } from 'zustand';
import { useApp, useServices } from '@/app/context';
import { HelpButton, Knob } from './components';
import { useHelp } from './help/help-context';
import { INDEX_ID } from '@/state/help-store';
import { PresetMenu } from './PresetMenu';
import { UndoRedo } from './history/UndoRedo';
import { TransportControls } from './TransportControls';

function MasterVolume() {
  const volume = useApp((s) => s.masterVolumeDb);
  const { appStore } = useServices();
  return (
    <Knob
      id="master-volume"
      value={volume}
      onChange={(v) => appStore.getState().setGlobal('master-volume', v)}
    />
  );
}

function AudioButton() {
  const audio = useApp((s) => s.audio);
  const { startAudio, host, appStore } = useServices();
  const on = audio === 'on';
  return (
    <button
      type="button"
      className="audio-btn"
      aria-pressed={on}
      data-audio={audio}
      disabled={audio === 'starting'}
      onClick={async () => {
        if (on) {
          await host.stop();
          appStore.getState().setAudio('off');
        } else {
          await startAudio();
        }
      }}
    >
      <span className="audio-led" aria-hidden="true" />
      {audio === 'on' ? 'Audio on' : audio === 'starting' ? 'Starting…' : 'Start audio'}
    </button>
  );
}

function Tempo() {
  const { projectStore } = useServices();
  const tempo = useStore(projectStore, (s) => s.project.tempo);
  return (
    <div className="tempo control" data-help-for="composition">
      <label htmlFor="tempo-input">Tempo</label>
      <input
        id="tempo-input"
        type="number"
        min={40}
        max={240}
        step={1}
        value={tempo}
        onChange={(e) => projectStore.getState().setTempo(Number(e.target.value))}
        aria-label="Tempo in beats per minute"
      />
      <span className="unit">BPM</span>
      <HelpButton helpId="composition" label="Tempo" />
    </div>
  );
}

function HelpIndexButton() {
  const { open } = useHelp();
  return (
    <button type="button" className="help-index-btn" onClick={() => open(INDEX_ID)}>
      Help
    </button>
  );
}

export function TopBar() {
  return (
    <header className="topbar">
      <h1 className="brand">Synth Lab</h1>
      <PresetMenu />
      <UndoRedo />
      <MasterVolume />
      <AudioButton />
      <TransportControls />
      <Tempo />
      <HelpIndexButton />
    </header>
  );
}
