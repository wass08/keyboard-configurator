import { useEffect } from 'react';
import { button, folder, useControls } from 'leva';
import { isStageHotkey, STAGE_NAMES, useStages } from './store';

export function StagesUI() {
  const stage = useStages(s => s.stage), label = useStages(s => s.label);
  const [, set] = useControls(() => ({ Stages: folder({
    ...Object.fromEntries(STAGE_NAMES.map((name, i) => [`${i + 1} — ${name}`, button(() => useStages.getState().select(i + 1))])),
    'Exit stages': button(() => useStages.getState().select(null)),
    panelHidden: { value: false, label: 'Hide debug panel', onChange: (panelHidden: boolean) => useStages.setState({ panelHidden }) },
    stageLabel: { value: false, label: 'Stage label', onChange: (label: boolean) => useStages.setState({ label }) },
    'Replay stage intro': button(() => window.__kb?.replayIntro()),
  }, { order: -200, collapsed: false }) }));
  useEffect(() => useStages.subscribe(s => (set as (values: Record<string, unknown>) => void)({ panelHidden: s.panelHidden, stageLabel: s.label })), [set]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!isStageHotkey(event)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      const s = useStages.getState();
      if (/^Digit[1-7]$/.test(event.code)) s.select(Number(event.code.slice(-1)));
      else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') s.select(Math.max(1, Math.min(7, (s.stage ?? 7) + (event.code === 'ArrowRight' ? 1 : -1))));
      else if (event.code === 'KeyH') useStages.setState({ panelHidden: !s.panelHidden });
      else useStages.setState({ label: !s.label });
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  return stage !== null && label ? <div className="stage-label studio-card" role="status">Stage {stage} — {STAGE_NAMES[stage - 1]}</div> : null;
}
