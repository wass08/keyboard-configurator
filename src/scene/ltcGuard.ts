import { ShaderChunk } from 'three';

// LTC_Evaluate already returns exactly zero behind the emitting plane. Move
// that identical predicate before the table fetches/Fresnel for all lobes.
// This preserves arbitrary live light placement, unlike fixed light layers.
if (!new URLSearchParams(location.search).has('ltcReference')) {
  const marker = 'void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight,';
  const chunk = ShaderChunk.lights_physical_pars_fragment, start = chunk.indexOf(marker), body = chunk.indexOf('{', start);
  if (start < 0 || body < 0) throw new Error('RectAreaLight shader changed: revalidate the LTC guard');
  ShaderChunk.lights_physical_pars_fragment = chunk.slice(0, body + 1) + `
    if (dot(cross(rectAreaLight.halfWidth, rectAreaLight.halfHeight), geometryPosition - rectAreaLight.position) > 0.0 || all(equal(rectAreaLight.color, vec3(0.0)))) return;
  ` + chunk.slice(body + 1);
}
