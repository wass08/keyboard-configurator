import { SceneFallback } from './ui/SceneFallback';
import { Component, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Stage } from './scene/Stage';
import { Brand, Hud } from './ui/Hud';
import { OpeningScreen } from './ui/OpeningScreen';
import { Leva } from 'leva';
import './styles.css';
import { StagesUI } from './stages/StagesUI';
import { useStages } from './stages/store';

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export default function App() {
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const panelHidden = useStages(s => s.panelHidden);
  return <main aria-label="Interactive 3D keyboard configurator" tabIndex={-1}>
    <div className="scene-layer"><SceneBoundary onFailure={fail}><Stage onFailure={fail} /></SceneBoundary></div>
    {failed && <SceneFallback />}
    <StagesUI />
    <Hud />
    {!failed && <OpeningScreen />}
    <Brand />
    <div id="studio-controls"><Leva theme={{ sizes: { rootWidth: '338px', controlWidth: '178px', numberInputMinWidth: '56px' } }} hidden={panelHidden || !new URLSearchParams(location.search).has('debug')} titleBar={{ title: 'Studio · camera & lighting' }} /></div>
    <div className="sr-only">Drag to orbit the keyboard. Scroll or pinch to zoom. Use arrow keys in the colorway picker to explore seven finishes. Type on your keyboard to write on the monitor; press Escape, then Tab, to move focus to the controls.</div>
  </main>;
}
