import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';

const fixtureRoot = 'scripts/fixtures/perf-hunt';
const frames = (page,n=5)=>page.evaluate(n=>new Promise(resolve=>{const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}),n);
async function settle(page) {
  await frames(page,2);
  await page.waitForFunction(()=>{const f=window.__cameraStore.focusState();return f.distance===f.target&&f.range===f.rangeTarget;});
  await page.evaluate(()=>window.__screenControl.freezeCaret(false));
  await page.waitForFunction(()=>!window.__screen().caretOn);
  await page.evaluate(()=>{window.__screenControl.freezeCaret(true);window.__dustControl.setTime(0);});await frames(page);
}
export function comparePixels(a,b) {
  const A=PNG.sync.read(a),B=PNG.sync.read(b);assert.equal(A.width,B.width);assert.equal(A.height,B.height);
  const histogram=new Uint32Array(256);let sum=0,large=0,max=0;
  for(let i=0;i<A.data.length;i++){if(i%4===3)continue;const d=Math.abs(A.data[i]-B.data[i]);sum+=d;histogram[d]++;if(d>8)large++;max=Math.max(max,d);}
  const count=A.width*A.height*3;let cumulative=0,p99=0;for(;p99<256;p99++){cumulative+=histogram[p99];if(cumulative>=count*.99)break;}
  return {meanChannelDelta:sum/count,p99ChannelDelta:p99,maxChannelDelta:max,channelsOver8Percent:100*large/count};
}
export async function lookChecks(browser,url,{baseline=false}={}) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await context.newPage();const result={};
  await mkdir(fixtureRoot,{recursive:true});
  try {
    await page.goto(`${url}/?capture=1&perf=1`);await page.waitForFunction(()=>window.__kb?.ready&&window.__screen);await page.evaluate(()=>window.__kb.finish());
    for(const name of ['hero-glacial-blue','hero-cool-black','hero-pink','closeup','terminal','stage-7']) {
      if(name.startsWith('hero-')) {await page.evaluate(id=>{window.__kb.setVariant(id);window.__cameraStore.reset();},name.slice(5));}
      else if(name==='closeup')await page.evaluate(()=>{window.__kb.setVariant('glacial-blue');window.__kb.camera('lighting-closeup');});
      else if(name==='terminal')await page.evaluate(()=>{window.__cameraStore.set({depthOfField:false});window.__kb.camera('screen-terminal');});
      else await page.evaluate(()=>{window.__cameraStore.reset();window.__stageControl.select(7);});
      await frames(page,2); await page.evaluate(()=>window.__kb.finish());
      await page.waitForFunction(()=>window.__kb.finished && window.__kb.phase==='assembled');
      const expected=name.startsWith('hero-')?name.slice(5):'glacial-blue';
      assert.equal(await page.evaluate(()=>window.__kb.displayedId),expected);
      await page.waitForFunction(()=>!window.__stages().transitioning);await settle(page);
      const image=await page.screenshot({path:`screenshots/hunt-${baseline?'before':'after'}-${name}.png`});
      if(baseline) {await writeFile(`${fixtureRoot}/${name}.png`,image);result[name]={baseline:true};}
      else {
        const delta=comparePixels(await readFile(`${fixtureRoot}/${name}.png`),image);
        result[name]={status:'passed',...delta,limits:{mean:0.65,p99:5,over8Percent:0.6}};
        assert.ok(delta.meanChannelDelta<=.65&&delta.p99ChannelDelta<=5&&delta.channelsOver8Percent<=.6,`${name}: look changed: ${JSON.stringify(delta)}`);
      }
    }
    if(!baseline) {
      const files=['hero-glacial-blue','closeup'];
      const pairs=await Promise.all(files.map(async name=>({name,before:(await readFile(`${fixtureRoot}/${name}.png`)).toString('base64'),after:(await readFile(`screenshots/hunt-after-${name}.png`)).toString('base64')})));
      const data=await page.evaluate(async pairs=>{
        const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=660;const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f6f0';ctx.fillRect(0,0,1440,660);
        ctx.fillStyle='#303638';ctx.font='16px monospace';ctx.fillText('BEFORE — 24 PCSS / 32 DoF / JPEG',20,25);ctx.fillText('AFTER — 12 PCSS / 16 DoF / WebP',740,25);
        for(let row=0;row<pairs.length;row++)for(let col=0;col<2;col++) {
          const img=new Image();img.src='data:image/png;base64,'+pairs[row][col?'after':'before'];await img.decode();
          ctx.drawImage(img,row?500:300,row?300:400,row?840:840,350,col*720,40+row*310,720,300);
        }
        return canvas.toDataURL('image/png').split(',')[1];
      },pairs);
      await writeFile('screenshots/perf-hunt-before-after.png',Buffer.from(data,'base64'));
    }
  }finally{await context.close();}
  return result;
}
if(process.argv[1]?.endsWith('/look-checks.mjs')) {
 const {chromium}=await import('playwright'),{preview}=await import('vite');
 const server=await preview({build:{outDir:process.env.HUNT_DIST??'dist'},preview:{host:'127.0.0.1',port:4193,strictPort:true},logLevel:'silent'});
 const browser=await chromium.launch({args:['--use-angle=metal']});
 try{const result=await lookChecks(browser,'http://127.0.0.1:4193',{baseline:process.argv.includes('--baseline')});await writeFile('screenshots/hunt-look-checks.json',JSON.stringify(result,null,2));console.log(result);}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
}
