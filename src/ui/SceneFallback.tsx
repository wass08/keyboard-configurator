export function SceneFallback() {
  return <section className="scene-fallback" role="alert" aria-labelledby="scene-fallback-title">
    <p className="opening-eyebrow">Keyboard configurator</p>
    <h1 id="scene-fallback-title">Let’s reopen the studio.</h1>
    <p>The 3D view paused or WebGL is unavailable. Reload to try again.</p>
    <button type="button" onClick={() => location.reload()}>Tap to reload the studio</button>
  </section>;
}
