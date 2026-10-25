import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { PerspectiveCamera, Vector3 } from 'three';
import { pixelDelta } from './film-checks.mjs';
const frames = (page, n = 5) => page.evaluate(n => new Promise(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n);
const settle = async page => { await frames(page); await page.waitForFunction(() => { const s = window.__cameraStore.focusState(); return s.distance === s.target && s.range === s.rangeTarget; }); };
const shot = async (page, name) => { const b = await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); return b; };
const percentile = (v, f) => [...v].sort((a,b) => a-b)[Math.floor((v.length-1)*f)];
const luma = (p,x,y) => { const i=(y*p.width+x)*4; return p.data[i]*.2126+p.data[i+1]*.7152+p.data[i+2]*.0722; };

export async function dofChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage(); observeErrors(page);
  try {
    await page.goto(`${url}/?capture=1`); await page.waitForFunction(() => window.__kb?.ready && window.__filmControl);
    await page.evaluate(() => { window.__kb.finish(); window.__kb.setVariant('pink'); window.__screenControl.freezeCaret(true); window.__lightingStore.set({ 'Dust.dustEnabled': false }); document.querySelector('.variant-picker').style.visibility='hidden'; });
    await frames(page); await page.evaluate(() => window.__kb.finish()); await frames(page);
    assert.equal(await page.evaluate(() => window.__kb.displayedId), 'pink');
    const cases=[];
    for (const [name, pose, fov] of [
      ['dof-close', { distance: .317, polarDeg: 72, azimuthDeg: 7, target: [0,.81,0] }, 50],
      ['dof-default', null, null],
      ['dof-far', { distance: 1.351, polarDeg: 54, azimuthDeg: -20, target: [0,.79,0] }, 24],
      ['dof-orbit-left', { distance: .8, polarDeg: 52, azimuthDeg: -55, target: [0,.79,0] }, 40],
      ['dof-orbit-right', { distance: .8, polarDeg: 76, azimuthDeg: 55, target: [0,.79,0] }, 40],
    ]) {
      await page.setViewportSize(name==='dof-close'?{width:1000,height:1100}:{width:1440,height:900}); await frames(page);
      await page.evaluate(({pose,fov}) => { window.__cameraStore.reset(); if(fov) window.__cameraStore.set({verticalFovDeg:fov}); if(pose) window.__cameraStore.orbit(pose); }, {pose,fov});
      await settle(page);
      const data = await page.evaluate(() => ({ camera: window.__camera(), focus: window.__cameraStore.focusState(), points: window.__kb.capFaceSamples().filter(p=>p.x>.02 && p.x<.98 && p.y>.02 && p.y<.98) }));
      const soft=PNG.sync.read(await shot(page,name));
      await page.evaluate(() => window.__cameraStore.set({depthOfField:false})); await frames(page);
      const sharp=PNG.sync.read(await shot(page,`${name}-off`));
      const changes=[], gradients=[];
      for(const p of data.points){
        const x=Math.round(p.x*soft.width),y=Math.round(p.y*soft.height);
        changes.push(Math.abs(luma(soft,x,y)-luma(sharp,x,y)));
        const g=(img)=>Math.hypot(luma(img,x+1,y)-luma(img,x-1,y),luma(img,x,y+1)-luma(img,x,y-1));
        const a=g(sharp); if(a>4) gradients.push(Math.min(2,g(soft)/a));
      }
      const s=data.focus;
      assert.ok(s.depthMin >= s.distance-s.range/2-1e-6 && s.depthMax <= s.distance+s.range/2+1e-6, `${name}: all eight keyboard corners lie in the sharp depth band`);
      assert.ok(s.range>=.38 && data.points.length>100);
      const p90=percentile(changes,.9), contrast=percentile(gradients,.5);
      assert.ok(p90<=2 && contrast>=.90,`${name}: focused cap pixels/edges vs DoF off: p90=${p90}, contrast=${contrast}`);
      // Background outside the projected keyboard bounds must actually change.
      const camera=new PerspectiveCamera(data.camera.lens.verticalFovDeg,soft.width/soft.height,.008,25);
      camera.position.fromArray(data.camera.position); camera.lookAt(new Vector3(...data.camera.target)); camera.updateMatrixWorld();
      const depths=Array.from({length:8},(_,i)=>-new Vector3(...s.bounds[0].map((v,k)=>i&(1<<k)?s.bounds[1][k]:v)).applyMatrix4(camera.matrixWorldInverse).z);
      const expectedMin=Math.min(...depths),expectedMax=Math.max(...depths);
      assert.ok(Math.abs(s.depthMin-expectedMin)<1e-6 && Math.abs(s.depthMax-expectedMax)<1e-6,'Independently projected world corners must match the live view-depth bounds');
      assert.ok(Math.abs(s.distance-(expectedMin+expectedMax)/2)<1e-6,'Focus uses view depth, not Euclidean distance');
      assert.ok(Math.abs(s.range-Math.max(data.camera.lens.minFocalRange,expectedMax-expectedMin+2*data.camera.lens.focalMargin))<1e-6,'Auto range covers the projected extent and per-side margin');
      const corners=Array.from({length:8},(_,i)=>new Vector3(...s.bounds[0].map((v,k)=>i&(1<<k)?s.bounds[1][k]:v)).project(camera));
      const box={x0:Math.min(...corners.map(p=>(p.x+1)/2*soft.width))-5,x1:Math.max(...corners.map(p=>(p.x+1)/2*soft.width))+5,y0:Math.min(...corners.map(p=>(1-p.y)/2*soft.height))-5,y1:Math.max(...corners.map(p=>(1-p.y)/2*soft.height))+5};
      let backgroundChanged=0;
      for(let y=2;y<soft.height-2;y+=2)for(let x=2;x<soft.width-2;x+=2)if(!(x>=box.x0&&x<=box.x1&&y>=box.y0&&y<=box.y1) && Math.abs(luma(soft,x,y)-luma(sharp,x,y))>2)backgroundChanged++;
      assert.ok(backgroundChanged>100,`${name}: background must blur (${backgroundChanged})`);
      cases.push({name,distance:data.camera.distance,focus:s.distance,range:s.range,depthExtent:[s.depthMin,s.depthMax],capSamples:changes.length,capP90Delta:p90,medianEdgeContrastRatio:contrast,backgroundChanged});
      await page.evaluate(() => window.__cameraStore.set({depthOfField:true}));
    }
    const silhouette=await page.evaluate(()=>window.__filmControl.silhouetteProbe());
    assert.ok(silhouette.cases[0].smearBandPx<=silhouette.limitPx && silhouette.cases[0].maxInsideDelta<.003,'Far checkerboard must not bleed onto focused foreground, even at first inside texel');
    assert.ok(silhouette.cases[1].outsideOverlap>.005,'Near blur must softly overlap the background (positive control)');
    assert.ok(silhouette.cases.every(c=>c.backgroundContrastRatio<.8),'Far checkerboard must genuinely blur');
    const quality=await page.evaluate(()=>window.__quality());
    assert.equal(quality.enabled,false); assert.equal(quality.dpr,1.5); assert.equal(quality.changes,0);
    return {status:'passed',limits:{capP90Delta:2,medianEdgeContrastRatio:.90,smearBandPx:1},cases,silhouette,captureQuality:quality};
  } finally {await context.close();}
}

export async function perfPixelChecks(browser,url,observeErrors){
  const buffers=[], reports=[];
  for(const reference of [true,false]){
    const context=await browser.newContext({viewport:{width:1200,height:750},deviceScaleFactor:1.5});
    const page=await context.newPage(); observeErrors(page);
    try{
      await page.goto(`${url}/?capture=1${reference?'&ltcReference=1&postReference=1':''}`); await page.waitForFunction(()=>window.__kb?.ready && window.__film);
      await page.evaluate(()=>{window.__kb.finish();window.__screenControl.freezeCaret(true);window.__lightingStore.set({'Dust.dustEnabled':false});document.querySelector('.variant-picker').style.visibility='hidden';});
      const images=[];
      for(const [name,variant,view] of [['hero-glacial','glacial-blue','default'],['hero-black','cool-black','default'],['hero-pink','pink','default'],['closeup','glacial-blue','closeup'],['terminal','glacial-blue','screen-terminal']]){
        await page.evaluate(({variant,view})=>{window.__kb.setVariant(variant);window.__kb.camera(view);window.__cameraStore.set({depthOfField:view!=='screen-terminal'});},{variant,view});
        await frames(page); await page.evaluate(()=>window.__kb.finish()); await frames(page); assert.equal(await page.evaluate(()=>window.__kb.displayedId),variant); await settle(page);
        const b=await shot(page,`perf-${name}-${reference?'reference':'optimized'}`); images.push(b);
        if(!reference){const d=pixelDelta(buffers[images.length-1],b);assert.ok(d.meanDelta<=.15 && d.changedPixels/(1200*750*2.25)<.005,`${name}: exact LTC zero guard / scene-only MSAA must preserve pixels: ${JSON.stringify(d)}`);reports.push({name,...d});}
      }
      if(reference)buffers.push(...images);
    }finally{await context.close();}
  }
  return {status:'passed',reference:'Original Three LTC + four-sample post targets and full bloom pyramid; same corrected optics. Scene geometry retains 4x MSAA in both.',limits:{meanChannelDelta:.15,fractionChangedOver1:.005},views:reports};
}

export async function adaptiveQualityCheck(browser,url,observeErrors){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
  const page=await context.newPage();observeErrors(page);
  try{
    await page.goto(`${url}/?quality-check=1`);await page.waitForFunction(()=>window.__kb?.ready && window.__quality && window.__film);
    await page.evaluate(()=>window.__kb.finish());await frames(page,5);
    await page.waitForFunction(()=>window.__quality().cooldownSeconds===0);
    const result=await page.evaluate(async()=>{
      const initial=window.__quality(), captures=window.__environment().captures, transitions=[];
      const start=performance.now();let last=initial.dpr;
      await new Promise(resolve=>{const tick=()=>{
        // Explicit synthetic CPU pressure exercises hysteresis; this is not
        // used as the product FPS or GPU-cost measurement.
        const t=performance.now();while(performance.now()-t<40){}
        const q=window.__quality();if(q.dpr!==last){transitions.push({atMs:performance.now()-start,...q});last=q.dpr;}
        if(performance.now()-start<4500)requestAnimationFrame(tick);else resolve();
      };requestAnimationFrame(tick);});
      return {initial,final:window.__quality(),transitions,metrics:window.__film().metrics,capturesBefore:captures,capturesAfter:window.__environment().captures};
    });
    assert.equal(result.initial.enabled,true);assert.ok(result.transitions.length>=1 && result.transitions.length<=1,'Two slow windows must lower quality once; cooldown prevents oscillation');
    assert.ok(result.final.dpr>=1 && result.final.dpr<=2 && result.final.dpr<result.initial.dpr,JSON.stringify(result));
    const [w,h]=result.metrics.buffer, targets=result.metrics.targetSizes;
    assert.deepEqual(targets[0].size,[w,h],'Composer follows adaptive DPR, not only the canvas');
    assert.deepEqual(targets.at(-1).size,[w,h],'Shared scene color/depth follows adaptive DPR');
    assert.equal(result.capturesAfter,result.capturesBefore,'A DPR change does not recapture the environment');
    assert.equal(result.final.decided,true);assert.equal(result.final.decisions,1,'Auto tier is selected once');
    assert.notEqual(result.final.tier,'high','Sustained 40ms frames must select a cheaper tier');
    return {status:'passed',method:'4.5s of explicit 40ms/frame main-thread pressure; separate from all reported FPS samples',...result};
  }finally{await context.close();}
}
