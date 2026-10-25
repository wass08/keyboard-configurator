import { SoftShadows } from '@react-three/drei';
import { useQuality } from './quality';
import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { Material, BasicShadowMap, PCFShadowMap, ShaderChunk } from 'three';

// Contact-hardening PCSS retains the tuned search/filter footprint and noise rotation.
// Factor sin(angle + constant) into a single rotation of a constant disk;
// the original repeated trigonometry is paid on every shadow receiver/lobe.
function kernel(samples: number) {
  const disk = Array.from({ length: samples }, (_, i) => {
  const r = Math.sqrt(i + .5) / Math.sqrt(samples), a = Math.fround(2.399963) * i;
  return `vec2(${(Math.cos(a) * r).toFixed(10)}, ${(Math.sin(a) * r).toFixed(10)})`;
}).join(',\n');
  return /* glsl */`
    uniform float contactShadowSize;
    const vec2 contactDisk[${samples}] = vec2[${samples}](${disk});
    float contactRand(vec2 uv) {return fract(sin(dot(uv,vec2(12.75613,38.12123)))*13234.76575);}
    float contactAngle(vec2 uv) {
      float average=0.0;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)average+=contactRand(uv+vec2(float(x),float(y)));
      return (contactRand(uv)-average*0.111111111+0.5)*PI2;
    }
    float contactPCSS(sampler2D shadowMap,vec4 coords) {
      float angle=contactAngle(gl_FragCoord.xy), c=cos(angle), s=sin(angle);
      mat2 rotation=mat2(c,s,-s,c);
      float texel=1.0/float(textureSize(shadowMap,0).x), blockers=0.0, sum=0.0;
      mat2 blockerRotation=rotation*(texel*2.0*contactShadowSize);
      vec2 offset;float z;
      #pragma unroll_loop_start
      for(int i=0;i<${samples};i++) {
        offset=blockerRotation*contactDisk[i];
        z=texture2D(shadowMap,coords.xy+offset).r;
        if(z<coords.z){sum+=z;blockers+=1.0;}
      }
      #pragma unroll_loop_end
      if(blockers==0.0)return 1.0;
      float blocker=sum/blockers;
      float radius=1.0+1.25*(coords.z-blocker)/blocker*contactShadowSize;
      float shadow=0.0;
      mat2 filterRotation=rotation*(texel*radius);
      #pragma unroll_loop_start
      for(int i=0;i<${samples};i++) {
        shadow+=step(coords.z,texture2D(shadowMap,coords.xy+filterRotation*contactDisk[i]).r);
      }
      #pragma unroll_loop_end
      return shadow/float(${samples});
    }
  `;
}
function ConstantDiskShadows({ size }: {size: number}) {
  const {gl,scene}=useThree();
  const tier=useQuality(state=>state.tier);
  const search = useMemo(()=>({value:size}),[]);
  search.value=size;
  useLayoutEffect(()=>{
    const original=ShaderChunk.shadowmap_pars_fragment, type=gl.shadowMap.type;
    // Diagnostic PCF comparison uses the same map, light, geometry and main
    // pass timing. It is never selected in the high-quality default path.
    const pcf=new URLSearchParams(location.search).has('pcfProbe') || tier==='low';
    if(pcf)gl.shadowMap.type=PCFShadowMap;
    else {
      const start=original.lastIndexOf('float getShadow( sampler2D shadowMap');
      const end=original.indexOf('if ( frustumTest ) {',start)+'if ( frustumTest ) {'.length;
      if(start<0||end<20)throw new Error('Revalidate the contact-shadow shader for this Three version');
      ShaderChunk.shadowmap_pars_fragment=(original.slice(0,end)+'\nreturn mix(1.0,contactPCSS(shadowMap,shadowCoord),shadowIntensity);'+original.slice(end)).replace('#ifdef USE_SHADOWMAP','#ifdef USE_SHADOWMAP\n'+kernel(tier==='medium'?8:12));
      gl.shadowMap.type=BasicShadowMap;
    }
    // Default materials created later (the powered-off panel in stages 1/2,
    // for example) must share the same cache key/uniform as the warmed ones.
    // Three's shader chunks are global too; one rig owns this page-wide patch.
    const prototypeCompile=Material.prototype.onBeforeCompile;
    const prototypeKey=Material.prototype.customProgramCacheKey;
    const signature=`contact-${pcf?'pcf':tier==='medium'?8:12}`;
    Material.prototype.onBeforeCompile=function(shader,renderer) {
      prototypeCompile.call(this,shader,renderer);shader.uniforms.contactShadowSize=search;
    };
    Material.prototype.customProgramCacheKey=function() {return `${prototypeKey.call(this)}|${signature}`;};
    const owners = new Map<Material, {compile: Material['onBeforeCompile']; key: Material['customProgramCacheKey']; ownCompile: boolean; ownKey: boolean}>();
    const invalidate=()=>scene.traverse(object=>{
      const mesh=object as Mesh;
      for(const material of mesh.material?Array.isArray(mesh.material)?mesh.material:[mesh.material]:[])material.needsUpdate=true;
    });
    scene.traverse(object => {
      const mesh = object as Mesh;
      for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
        if (owners.has(material)) continue;
        const ownCompile=Object.hasOwn(material,'onBeforeCompile'),ownKey=Object.hasOwn(material,'customProgramCacheKey');
        if(!ownCompile&&!ownKey)continue;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
        const originalKey=(ownKey?key:prototypeKey).call(material);
        owners.set(material,{compile,key,ownCompile,ownKey});
        material.onBeforeCompile=function(shader,renderer) {
          compile.call(this,shader,renderer);shader.uniforms.contactShadowSize=search;
        };
        material.customProgramCacheKey=()=>`${originalKey}|${signature}`;
      }
    });
    invalidate();gl.shadowMap.needsUpdate=true;
    return ()=>{
      ShaderChunk.shadowmap_pars_fragment=original;gl.shadowMap.type=type;
      Material.prototype.onBeforeCompile=prototypeCompile;Material.prototype.customProgramCacheKey=prototypeKey;
      for(const [material,previous] of owners) {
        if(previous.ownCompile)material.onBeforeCompile=previous.compile;else Reflect.deleteProperty(material,'onBeforeCompile');
        if(previous.ownKey)material.customProgramCacheKey=previous.key;else Reflect.deleteProperty(material,'customProgramCacheKey');
      }
      invalidate();gl.shadowMap.needsUpdate=true;
    };
  },[gl,scene,tier,search]);
  return null;
}

export function ContactShadows({size}:{size:number}) {
  return new URLSearchParams(location.search).has('shadowReference') ? <SoftShadows size={size} samples={24}/> : <ConstantDiskShadows size={size}/>;
}
