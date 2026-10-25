import { createRoot } from 'react-dom/client';
import App from './App';
import './debug';
import { getOwnedResourceStats } from './resources/ownership';

declare const __BUILD_REVISION__: string;
window.__build = __BUILD_REVISION__;

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

// Capture-only lifecycle harness: exercise real Canvas unmount/remount without
// adding controls to the product or clearing intentional application caches.
if (new URLSearchParams(location.search).has('capture')) {
  window.__app = {
    setMounted: mounted => root.render(mounted ? <App /> : null),
    resources: getOwnedResourceStats,
  };
}
