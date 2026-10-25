import {chromium} from 'playwright';
import {preview} from 'vite';
import {writeFile, mkdir} from 'node:fs/promises';
const results=[];
await mkdir('screenshots',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=metal']});
try {
 for(const [label,outDir] of [['before',process.env.HUNT_BASELINE_DIST],['after','dist']]) {
  if(!outDir)throw new Error('HUNT_BASELINE_DIST must point to the preserved instrumented build');
  const server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:4194,strictPort:true},logLevel:'silent'});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  try {
   await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1.5*1024*1024,uploadThroughput:256*1024});
   await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,v8',transferMode:'ReturnAsStream'});
   await page.goto('http://127.0.0.1:4194/');await page.waitForFunction(()=>window.__kb?.ready,null,{timeout:120000});
   const load=await page.evaluate(()=>({readyMs:performance.now(),startup:window.__film().startup,programs:window.__film().metrics.programs,preparation:window.__kb.inspect().intro.preparation,
     assets:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),bytes:r.encodedBodySize,duration:r.duration})),navigation:performance.getEntriesByType('navigation').map(n=>({ttfb:n.responseStart,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime}))}));
   const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await complete;let data='';
   while(true){const r=await cdp.send('IO.read',{handle:stream});data+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});
   await writeFile(`screenshots/load-${label}-trace.json`,data);
   const events=JSON.parse(data).traceEvents,decodes=events.filter(e=>e.ph==='X'&&/decode|compile/i.test(e.name));
   load.decodeCompileTrace=Object.fromEntries([...new Set(decodes.map(e=>e.name))].map(name=>{const rows=decodes.filter(e=>e.name===name);return[name,{count:rows.length,totalMs:rows.reduce((a,e)=>a+e.dur/1000,0),maxMs:Math.max(...rows.map(e=>e.dur/1000))}];}));
   // Decode in isolation from a new encoded Blob, excluding network transfer.
   load.decodeBench=await page.evaluate(async()=>{const urls=[...new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(u=>/textures\/.*\.(jpg|webp)$/.test(u)))],result=[];for(const url of urls){const bytes=await fetch(url).then(r=>r.arrayBuffer()),times=[];for(let i=0;i<3;i++){const start=performance.now(),b=await createImageBitmap(new Blob([bytes]));times.push(performance.now()-start);b.close();}result.push({name:url.split('/').pop(),decodeMs:times.sort((a,b)=>a-b)[1]});}return result;});
   results.push({label,network:'100ms RTT, 1.5MiB/s download, cold cache; native CPU',...load});console.log(label,load.readyMs,load.decodeCompileTrace);
  }finally{await context.close();await new Promise(resolve=>server.httpServer.close(resolve));}
 }
 await writeFile('screenshots/perf-hunt-load.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
