// Diagnostic-only scene perturbations, measured with a direct main-pass query.
// React DevTools exposes host instances without a production mutation API.
import {chromium} from 'playwright';
import {preview} from 'vite';
import {writeFile} from 'node:fs/promises';
const server=await preview({build:{outDir:process.env.SUSPECT_DIST??'dist'},preview:{host:'127.0.0.1',port:4196,strictPort:true},logLevel:'silent'});
const browser=await chromium.launch({args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.env.SUSPECT_DPR??1.5)});
await context.addInitScript(()=>{
 const roots=new Set();window.__diagnosticRoots=roots;
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){const id=this.renderers.size+1;this.renderers.set(id,renderer);return id;},onCommitFiberRoot(_id,root){roots.add(root);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};
});
const page=await context.newPage(),results={};
const frames=n=>page.evaluate(n=>new Promise(resolve=>{const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}),n);
try {
 await page.goto(`http://127.0.0.1:4196/?capture=1&perf=1${process.env.SUSPECT_QUERY??''}`);await page.waitForFunction(()=>window.__kb?.ready,null,{timeout:120000});await page.evaluate(()=>window.__kb.finish());await frames(45);
 const found=await page.evaluate(()=>{
   for(const root of window.__diagnosticRoots){const stack=[root.current];while(stack.length){const n=stack.pop();if(n.child)stack.push(n.child);if(n.sibling)stack.push(n.sibling);const instance=n.stateNode;if(instance?.root?.getState&&instance.object?.isObject3D){const state=instance.root.getState();if(state.scene?.getObjectByName('keyboard-assembly')){window.__diagnosticScene=state;return true;}}}}return false;
 });
 if(!found)throw new Error('React DevTools did not expose an R3F host instance');
 results.inventory=await page.evaluate(()=>{
  const {scene,gl}=window.__diagnosticScene,root=scene.getObjectByName('keyboard-assembly'),keys=root.children.find(o=>o.children.length===81);
  const caps=[...new Set(keys.children.slice(0,80).map(o=>o.children[0].material))];window.__diagnosticCaps=caps.map(m=>({m,clearcoat:m.clearcoat,sheen:m.sheen}));
  window.__diagnosticOriginalShadow=gl.shadowMap.type;
  const areas=[];scene.traverse(o=>{if(o.isRectAreaLight)areas.push({o,visible:o.visible});});window.__diagnosticAreas=areas;
  const wood=scene.getObjectByName('desk-wood').material;window.__diagnosticWood={m:wood,clearcoat:wood.clearcoat,normalMap:wood.normalMap,clearcoatNormalMap:wood.clearcoatNormalMap};
  const wall=scene.getObjectByName('studio-wall').material;window.__diagnosticWall={m:wall,compile:wall.onBeforeCompile,key:wall.customProgramCacheKey};
  const legends=[];scene.traverse(o=>{if(o.material?.alphaTest===0.000001&&!legends.includes(o.material))legends.push(o.material);});window.__diagnosticLegends=legends;
  const receivers=[];scene.traverse(o=>{if(o.receiveShadow)receivers.push(o);});window.__diagnosticReceivers=receivers;
  return {caps:80,sharedCapMaterials:caps.length,areaLights:areas.map(({o})=>({name:o.name,intensity:o.intensity,visible:o.visible})),shadowType:gl.shadowMap.type,dpr:gl.getPixelRatio()};
 });
 const cases=process.env.SUSPECT_CASES?.split(',');
 if(process.env.SUSPECT_TAG==='after'&&cases)cases.splice(cases.length-1,0,'legendAlphaTestOff','wallEarlyExitOff');
 for(const name of (cases??['default','hardwarePCF','receiverShadowsOff','largeReceiverShadowsOff','areaLightsOff','capCoatAndSheenOff','woodCoatAndNormalsOff','wallShaderOff','defaultEnd'])) {
  await page.evaluate(name=>{
   const {scene,gl}=window.__diagnosticScene;
   for(const {m,clearcoat,sheen} of window.__diagnosticCaps){m.clearcoat=name==='capCoatAndSheenOff'?0:clearcoat;m.sheen=name==='capCoatAndSheenOff'?0:sheen;}
   for(const {o,visible} of window.__diagnosticAreas)o.visible=name==='areaLightsOff'?false:visible;
   gl.shadowMap.type=name==='hardwarePCF'?1:window.__diagnosticOriginalShadow;
   for(const o of window.__diagnosticReceivers)o.receiveShadow=!(name==='receiverShadowsOff'||name==='largeReceiverShadowsOff'&&['studio-wall','desk-wood'].includes(o.name));
   const w=window.__diagnosticWood;for(const key of ['clearcoat','normalMap','clearcoatNormalMap'])w.m[key]=name==='woodCoatAndNormalsOff'?(key==='clearcoat'?0:null):w[key];
   const wall=window.__diagnosticWall;wall.m.onBeforeCompile=name==='wallShaderOff'?function(shader,renderer){wall.compile.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() { gl_FragColor=vec4(0.0); return;');}:wall.compile;
   if(name==='wallEarlyExitOff')wall.m.onBeforeCompile=function(shader,renderer){wall.compile.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('if (wallMaskEnabled && length((vWallPosition-wallMaskCenter)/wallMaskRadius)>=1.0)','if (false)');};
   wall.m.customProgramCacheKey=['wallShaderOff','wallEarlyExitOff'].includes(name)?()=>wall.key.call(wall.m)+'|'+name:wall.key;
   for(const m of window.__diagnosticLegends)m.alphaTest=name==='legendAlphaTestOff'?0:0.000001;
   scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});gl.shadowMap.needsUpdate=true;
  },name);
  await frames(45);await page.evaluate(()=>window.__filmControl.profile(true,'mainScene'));await frames(340);await page.evaluate(()=>window.__filmControl.profile(false));await frames(10);
  results[name]=await page.evaluate(()=>window.__film().gpu.gpu.mainScene);console.log(name,results[name]);
 }
 await writeFile(`screenshots/perf-hunt-suspects${process.env.SUSPECT_TAG?'-'+process.env.SUSPECT_TAG:''}.json`,JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
