import assert from 'node:assert/strict';
import {comparePixels} from './look-checks.mjs';
export async function qualityChecks(browser,url,observeErrors) {
  const results={};
  for(const tier of ['high','medium','low']) {
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
    const page=await context.newPage();observeErrors(page);
    try {
      await page.goto(`${url}/?capture=1&debug&quality=${tier}`);
      await page.waitForFunction(()=>window.__kb?.ready&&window.__quality,null,{timeout:120000});
      await page.evaluate(()=>window.__kb.finish());
      await page.waitForFunction(tier=>window.__quality().tier===tier,tier);
      const info=await page.evaluate(()=>({quality:window.__quality(),film:window.__film(),lighting:window.__lighting().values,env:window.__environment().captures}));
      assert.equal(info.quality.mode,tier);assert.equal(info.quality.decided,true);
      assert.equal(info.film.passes.find(p=>p.name==='depthOfField').enabled,tier!=='low');
      assert.equal(info.film.quality.gatherSamples,tier==='medium'?8:16);
      assert.equal(info.film.quality.shadowType,tier==='low'?1:0);
      assert.equal(info.lighting.rendering.quality,tier);
      assert.equal(info.lighting.lights.spot.intensity,6.235,'Quality never rewrites the user rig');
      assert.equal(info.lighting.film.toneMapping,'ACES Filmic');
      await page.evaluate(()=>window.__lightingStore.set({'Rendering.quality':'high'}));
      await page.waitForFunction(()=>window.__quality().tier==='high'&&window.__film().quality.shadowType===0);
      assert.equal(await page.evaluate(()=>window.__environment().captures),info.env,'Tier edits do not recapture the environment');
      if(tier==='high') {
        await page.evaluate(()=>{document.querySelector('#studio-controls').style.visibility='hidden';window.__cameraStore.set({depthOfField:false});window.__screenControl.freezeCaret(false);});
        await page.waitForFunction(()=>!window.__screen().caretOn);
        await page.evaluate(()=>{window.__screenControl.freezeCaret(true);window.__dustControl.setTime(0);});
        await page.waitForTimeout(100);const high=await page.screenshot();
        await page.evaluate(()=>window.__lightingStore.set({'Key · spot (shadows).shadowSoftness':10}));
        await page.waitForTimeout(100);const sharp=await page.screenshot();
        const softness=comparePixels(high,sharp);assert.ok(softness.meanChannelDelta>.01,'Softness changes the rendered shadow live');
        await page.evaluate(()=>window.__lightingStore.set({'Key · spot (shadows).shadowSoftness':147}));
        await page.waitForTimeout(100);const restored=await page.screenshot();
        assert.ok(comparePixels(high,restored).meanChannelDelta<.01,'Restoring softness restores the exact footprint');
        const programs=await page.evaluate(()=>window.__film().metrics.programs);
        await page.evaluate(()=>window.__lightingStore.set({'Key · spot (shadows).shadowSoftness':150}));
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>window.__film().metrics.programs),programs,'Softness tuning does not accumulate compiled shader variants');
        await page.evaluate(()=>window.__lightingStore.set({'Key · spot (shadows).shadowSoftness':147,'Rendering.quality':'medium'}));
        await page.waitForFunction(()=>window.__quality().tier==='medium');await page.waitForTimeout(150);
        const medium=comparePixels(high,await page.screenshot());assert.ok(medium.meanChannelDelta>.001,'The 8-point medium shadow kernel must actually replace the 12-point program');
        results.liveShadowControls={status:'passed',softnessDelta:softness.meanChannelDelta,mediumKernelDelta:medium.meanChannelDelta,softnessCreatesPrograms:false};
      }
      results[tier]={status:'passed',...info.quality,rendering:info.film.quality,manualReturnToHigh:true};
    }finally{await context.close();}
  }
  return results;
}
