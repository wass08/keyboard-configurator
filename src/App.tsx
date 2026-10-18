import { Component } from 'react';
import type { ReactNode } from 'react';
import { Stage } from './scene/Stage';
import { VariantPicker } from './ui/VariantPicker';
import { Leva } from 'leva';
import './styles.css';

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="scene-error" role="alert">The 3D scene could not load. Please reload with WebGL enabled.</p> : this.props.children; }
}
export default function App() {
  return <main aria-label="Interactive 3D keyboard configurator">
    <SceneBoundary><Stage /></SceneBoundary>
    <VariantPicker />
    <div id="studio-controls"><Leva theme={{ sizes: { rootWidth: '338px', controlWidth: '178px', numberInputMinWidth: '56px' } }} hidden={!new URLSearchParams(location.search).has('debug')} titleBar={{ title: 'Studio · camera & lighting' }} /></div>
    <div className="sr-only">Drag to orbit the keyboard. Scroll or pinch to zoom. Use arrow keys in the colorway picker to explore seven finishes. Type on your keyboard to write on the monitor; press Escape, then Tab, to move focus to the controls.</div>
  </main>;
}
