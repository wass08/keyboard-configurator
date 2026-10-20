/** Real production stages, with all other user values untouched. */
export async function stagePerformance(page) {
  return page.evaluate(async () => {
    const frames = n => new Promise(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); });
    const sample = async n => {
      const dt = []; let last = performance.now();
      await new Promise(resolve => { const tick = now => { dt.push(now - last); last = now; if (dt.length < n) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      const sorted = [...dt].sort((a,b) => a-b);
      return { frames: n, fps: 1000 / (dt.reduce((a,b) => a+b, 0) / n), p95Ms: sorted[Math.floor(n * .95)], maxMs: sorted.at(-1), framesAbove34ms: dt.filter(t => t > 34).length };
    };
    const transitions = [];
    for (const stage of [1,2,3,4,5,6,7]) {
      const captures = window.__environment().captures;
      window.__stageControl.select(stage);
      const timing = await sample(65);
      if (window.__stages().transitioning) throw new Error(`Stage ${stage} failed to settle`);
      const capturesAfter = window.__environment().captures;
      await frames(8);
      if (window.__environment().captures !== capturesAfter || capturesAfter - captures > 1) throw new Error('Stage transition recaptures the environment repeatedly');
      if (timing.framesAbove34ms > capturesAfter - captures) throw new Error(`Stage ${stage} hitched beyond its single environment capture: ${JSON.stringify(timing)}`);
      transitions.push({ stage, ...timing, environmentCaptures: capturesAfter - captures });
    }
    const final = await sample(180);
    window.__stageControl.select(1); await frames(60);
    const bare = await sample(180);
    window.__stageControl.select(null); await frames(60);
    return { viewport: [innerWidth,innerHeight], dpr:devicePixelRatio, stage1:bare, stage7:final, transitions };
  });
}
