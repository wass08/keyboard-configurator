// Alternate the original and optimized shadow kernels on the same host.
// All other assets, materials, light values and post effects are identical.
import {chromium} from 'playwright';
import {preview} from 'vite';
import {writeFile} from 'node:fs/promises';
const server=await preview({preview:{host:'127.0.0.1',port:4198,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-angle=metal']});
const runs=[];
try {
 for(const reference of [true,false,true,false]) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
  try {
   const page=await context.newPage();
   const frames=n=>page.evaluate(n=>new Promise(resolve=>{const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}),n);
   await page.goto(`http://127.0.0.1:4198/?capture=1&perf=1${reference?'&shadowReference=1':''}`);
   await page.waitForFunction(()=>window.__kb?.ready,null,{timeout:120000});await page.evaluate(()=>window.__kb.finish());await frames(45);
   const scopes={};
   for(const label of ['mainScene','frame']) {
    await page.evaluate(label=>window.__filmControl.profile(true,label),label);await frames(340);
    await page.evaluate(()=>window.__filmControl.profile(false));await frames(10);
    scopes[label]=await page.evaluate(()=>window.__film().gpu);
   }
   const result={kernel:reference?'original-24':'constant-12',scopes};runs.push(result);
   console.log(result.kernel,JSON.stringify(Object.fromEntries(Object.entries(scopes).map(([k,v])=>[k,v.gpu[k]]))));
  }finally{await context.close();}
 }
 await writeFile('screenshots/perf-hunt-paired.json',JSON.stringify({method:'Alternating original/optimized PCSS, 340 direct samples per scope; same optimized assets and post chain; DPR 1.5',runs},null,2));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
