import './theme/theme.css';
import './components/components.css';
import './synth/synth.css';
import './visualisers/viz.css';
import './keyboard/keyboard.css';
import './help/help.css';
import { HelpLayout, HelpProvider } from './help/HelpDrawer';
import './layout.css';
import { KitDemo } from './KitDemo';
import { SynthPanel } from './synth/SynthPanel';
import { KeyboardZone } from './keyboard/KeyboardZone';
import { useKeyboardPlayer } from './keyboard/useKeyboardPlayer';
import { TopBar } from './TopBar';
import { Zone } from './Zones';

export function App() {
  useKeyboardPlayer();
  if (location.hash === '#kit') return <KitDemo />;
  return (
    <HelpProvider>
      <div className="app">
        <TopBar />
        <HelpLayout>
          <main className="app-main">
            <SynthPanel />
            <KeyboardZone />
            <Zone title="Composition" id="composition" collapsible>
              <p className="placeholder">Tracks and piano roll arrive with the composition tool.</p>
            </Zone>
          </main>
        </HelpLayout>
      </div>
    </HelpProvider>
  );
}
