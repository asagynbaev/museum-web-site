// Copied from ai-concierge/web/src/avatar/bars-fur.ts by scripts/export-museum.mjs - edit it there and export again.
// Shell fur for the snow leopard: the body is drawn again as N slightly inflated "shells"; each shell keeps only
// the cross-sections of procedural strands (one per UV cell, random length and offset, tapering to the tip),
// so together they form individual hairs with a soft, fluffy silhouette. Shells share the body's geometry,
// skeleton and morph weights, so the fur follows breathing, the jaw and every bone. The build writes a per-vertex
// fur length (_FUR: 0 on the eyes, nose, lips, whiskers and toe beans, short on the face).
import * as THREE from 'three';
import { EYE_FUR_GLSL, type EyeUniforms } from './bars-eyes';
import { ART_FACE_DECL } from './bars-artface';

export interface FurOptions {
  /** Number of shells (0 = no fur). */
  shells: number;
  /** Full fur length, metres. */
  length: number;
  /** Strands per UV unit (the build's UV scale is ~2.6 m per unit: 1300 ≈ one strand every 2 mm). */
  density: number;
  /** Hair height scale: > 1 makes a denser coat towards the tips. */
  thickness: number;
  /** Droop of the tips, metres at full length (model space, Y up). */
  gravity: number;
}

// Off by default: the coat is painted in the texture, as in the user's own renders of the model. ?fur=16 grows
// silhouette-only shells (they fade where the surface faces the camera) for the fluffy outline of the concept art.
export const FUR_DEFAULTS: FurOptions = { shells: 0, length: 0.012, density: 1300, thickness: 1.15, gravity: 0.004 };

const VERT_DECL = /* glsl */ `
attribute float _fur;
uniform float uShell;
uniform float uFurLen;
uniform float uGravity;
varying float vFur;
varying vec3 vRest;
`;

const VERT_OFFSET = /* glsl */ `
#include <skinning_vertex>
vFur = _fur;
vRest = position;
{
  float h = uShell * _fur;
  transformed += normalize(objectNormal) * uFurLen * h + vec3(0.0, -uGravity * h * h, 0.0);
}
`;

const FRAG_DECL = /* glsl */ `
uniform float uShell;
uniform float uDensity;
uniform float uThick;
uniform sampler2D uFurNoise;
varying float vFur;
varying vec3 vRest;
${EYE_FUR_GLSL}
${ART_FACE_DECL}
`;

// Strands from a mip-mapped noise texture: every texel is one hair whose height is the noise value; linear
// filtering rounds it and tapers it towards the tip (higher shells need higher values), and the mip chain
// averages hairs that are smaller than a pixel instead of letting them sparkle. A coarse octave makes clumps.
const FRAG_STRANDS = /* glsl */ `
#include <map_fragment>
{
  vec2 st = vMapUv * uDensity / 256.0;
  float n = texture2D(uFurNoise, st).r;
  float clump = texture2D(uFurNoise, st * 0.13 + 0.37).g;
  float len = vFur * mix(0.65, 1.0, clump) * barsEyeFur(vRest) * barsMouthFur(vRest) * (1.0 - artFaceMask(vRest));
  float hair = n * len * uThick;          // this hair's height at this point
  if (len < 0.03) discard;
  float a = smoothstep(uShell - 0.03, uShell + 0.08 + fwidth(n) * 0.5, hair);
  // silhouette only: strands facing the camera would read as a towel
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 1.4);
  a *= smoothstep(0.08, 0.55, rim);
  if (a < 0.03) discard;
  diffuseColor.a = a;
  // silhouette fur is backlit and translucent: a touch brighter than the coat, never darker (a dark fringe reads
  // as an outline)
  diffuseColor.rgb *= mix(1.0, 1.05, uShell);
  totalEmissiveRadiance += diffuseColor.rgb * (0.12 + 0.1 * uShell) * rim;
}
`;

let noiseTex: THREE.DataTexture | null = null;
function furNoise(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // hair heights, biased towards tall hairs so the coat looks dense; G = an independent channel for clumps
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(255 * Math.pow(Math.random(), 0.6));
    data[i * 4 + 1] = Math.round(255 * Math.random());
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}

/** Darkens the skin under the fur (what shows between strands). Call on the body material's shader. */
export function furRootShading(shader: { vertexShader: string; fragmentShader: string }, shells: boolean): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float _fur;\nvarying float vFurRoot;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurRoot = _fur;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFurRoot;')
    .replace('#include <color_fragment>', shells ? '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.9, vFurRoot);' : '#include <color_fragment>')
    // bare skin (nose leather, toe beans, the mouth) is glossy; fur is matte
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42, roughnessFactor, smoothstep(0.0, 0.06, vFurRoot));')
    // ink does not shine: on the near-black liner and the eye opening's wall (seen edge-on round a half-closed eye)
    // the grazing Fresnel sheen drew a light hairline along the lid
    .replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
{
  float ink = 1.0 - smoothstep(0.03, 0.09, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
  material.specularColor *= 1.0 - ink;
  material.specularColorBlended *= 1.0 - ink;
  material.specularF90 *= 1.0 - ink;
}`,
    );
}

type U = Record<string, { value: unknown }>;
const ART_OFF: U = {
  uArtOn: { value: 0 }, uArtMouthOn: { value: 0 }, uArtMap: { value: new THREE.Vector4() }, uArtSize: { value: new THREE.Vector2(1, 1) },
  uArtEyeL: { value: new THREE.Vector4(0, 0, 1, 1) }, uArtEyeR: { value: new THREE.Vector4(0, 0, 1, 1) },
  uArtMouthWow: { value: new THREE.Vector4(0, 0, 1, 1) },
  uArtCoreL: { value: new THREE.Vector4(0, 0, 1, 1) }, uArtCoreR: { value: new THREE.Vector4(0, 0, 1, 1) },
};

function shellMaterial(base: THREE.MeshStandardMaterial, h: number, o: FurOptions, eyes: EyeUniforms | null, art: U | null): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    name: `FurShell${h.toFixed(2)}`,
    map: base.map,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.6,
    // Classic shell fur: alpha-blended layers drawn inside-out (renderOrder). Alpha-to-coverage was tried and
    // brightened the coat (partial-coverage layers stacked up), so the soft hair edges are blended instead.
    transparent: true,
    depthWrite: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShell = { value: h };
    shader.uniforms.uFurLen = { value: o.length };
    shader.uniforms.uGravity = { value: o.gravity };
    shader.uniforms.uDensity = { value: o.density };
    shader.uniforms.uThick = { value: o.thickness };
    shader.uniforms.uFurNoise = { value: furNoise() };
    // the same objects as the eye shader's: the fur keeps clear of the eyes as they open, widen and squint
    shader.uniforms.uEyeA = eyes?.uEyeA ?? { value: [new THREE.Vector4(), new THREE.Vector4()] };
    shader.uniforms.uEyeB = eyes?.uEyeB ?? { value: [new THREE.Vector4(), new THREE.Vector4()] };
    shader.uniforms.uEyeGeo = eyes?.uEyeGeo ?? { value: new THREE.Vector3(0, -10, 1) };
    shader.uniforms.uMouthZ = eyes?.uMouthZ ?? { value: new Array(9).fill(0) };
    shader.uniforms.uMouthP = eyes?.uMouthP ?? { value: new THREE.Vector4() };
    for (const k of Object.keys(ART_OFF)) shader.uniforms[k] = (art ?? ART_OFF)[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <skinning_vertex>', VERT_OFFSET);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <map_fragment>', FRAG_STRANDS)
      // the strands sit on the silhouette, where the body normal faces away from the light: tilt their shading
      // normal towards the camera so they take the lit colour of the coat's front
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(normal + vec3(0.0, 0.0, 0.8));');
  };
  m.customProgramCacheKey = () => 'bars-fur-shell';
  return m;
}

/** Grows shells over a skinned, morphed body mesh. Returns the shell meshes (added next to the body). */
export function growFur(body: THREE.SkinnedMesh, o: FurOptions = FUR_DEFAULTS, eyes: EyeUniforms | null = null, art: U | null = null): THREE.SkinnedMesh[] {
  if (o.shells <= 0 || !body.geometry.getAttribute('_fur')) return [];
  const base = body.material as THREE.MeshStandardMaterial;
  const shells: THREE.SkinnedMesh[] = [];
  for (let i = 1; i <= o.shells; i++) {
    const h = i / o.shells;
    const s = new THREE.SkinnedMesh(body.geometry, shellMaterial(base, h, o, eyes, art));
    s.name = `${body.name}_fur${i}`;
    s.bind(body.skeleton, body.bindMatrix);
    s.bindMode = body.bindMode;
    s.morphTargetInfluences = body.morphTargetInfluences; // same array: the shells follow every morph
    s.morphTargetDictionary = body.morphTargetDictionary;
    s.position.copy(body.position);
    s.quaternion.copy(body.quaternion);
    s.scale.copy(body.scale);
    s.frustumCulled = false;
    s.castShadow = false;
    s.receiveShadow = true;
    s.renderOrder = i;
    body.parent?.add(s);
    shells.push(s);
  }
  return shells;
}
