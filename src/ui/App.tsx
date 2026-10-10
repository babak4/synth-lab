import './theme/theme.css';
import './components/components.css';
import './synth/synth.css';
import './visualisers/viz.css';
import './keyboard/keyboard.css';
import './help/help.css';
import { HelpLayout, HelpProvider } from './help/HelpDrawer';
import './layout.css';
import { KitDemo } from './KitDemo';
import { OutputStrip } from './OutputStrip';
import { TabBar, TabPanel } from './Workspace';
import { KeyboardZone } from './keyboard/KeyboardZone';
import { useKeyboardPlayer } from './keyboard/useKeyboardPlayer';
import { useUndoShortcuts } from './history/useUndoShortcuts';
import { TopBar } from './TopBar';

export function App() {
  useKeyboardPlayer();
  useUndoShortcuts();
  if (location.hash === '#kit') return <KitDemo />;
  return (
    <HelpProvider>
      <div className="app">
        <TopBar />
        <TabBar />
        <HelpLayout footer={<div className="pinned"><OutputStrip /><KeyboardZone /></div>}>
          <TabPanel />
        </HelpLayout>
      </div>
    </HelpProvider>
  );
}
