// Copied from ai-concierge/web/src/avatar/bars-lines.ts by scripts/export-museum.mjs - edit it there and export again.
// The closed-mouth lines of the concept art, drawn on the face by the shader: the smug's smile line under its big
// pads and the angry '︵' lie low on the muzzle, far from the cut mouth (which is the little notch where the pads
// meet). The build exports each as a curve in rest space (glTF extras 'mouth_lines': half width, sigma, 9 rest-y
// samples at |x| = 0..half width); the smile / frown keys groove the same curves, and the browser darkens along them
// with the keys' weights — a line that moves with the skin.
import * as THREE from 'three';

export interface LineUniforms {
  /** half width (rest x), weight on +x, sigma (metres), weight on -x */
  uLineS: { value: THREE.Vector4 };
  uLineSY: { value: number[] };
  uLineF: { value: THREE.Vector4 };
  uLineFY: { value: number[] };
  /** The cut mouth's own line (the art draws a dark line round every open mouth): half width, sigma. */
  uLineC: { value: THREE.Vector4 };
  uLineCY: { value: number[] };
  /** The four openings' weights (jaw, laugh, o, big o) and half widths: the line only as far as the mouth is open. */
  uCutW: { value: THREE.Vector4 };
  uCutHW: { value: THREE.Vector4 };
  /** The laugh's half width and its two in-between shapes' shares of it (mouthLaugh1 / 2), from the build. */
  laughHW: number;
  laughSteps: [number, number];
  /** The four openings' half widths from the build (uCutHW is rewritten every frame from these). */
  cutHW: [number, number, number, number];
}

export function lineUniforms(): LineUniforms {
  return {
    uLineS: { value: new THREE.Vector4(0, 0, 0.002, 0) },
    uLineSY: { value: new Array(9).fill(0) },
    uLineF: { value: new THREE.Vector4(0, 0, 0.002, 0) },
    uLineFY: { value: new Array(9).fill(0) },
    uLineC: { value: new THREE.Vector4(0, 0, 0.0016, 0) },
    uLineCY: { value: new Array(9).fill(0) },
    uCutW: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCutHW: { value: new THREE.Vector4(0, 0, 0, 0) },
    laughHW: 0,
    laughSteps: [0.5, 0.78],
    cutHW: [0, 0, 0, 0],
  };
}

/** Loads the cut's curve (13 numbers: half width, sigma, 9 samples, 4 opening half widths). */
export function setMouthCut(u: LineUniforms, extras: number[]): void {
  if (extras.length < 15) return;
  u.uLineC.value.x = extras[0];
  u.uLineC.value.z = extras[1];
  for (let k = 0; k < 9; k++) u.uLineCY.value[k] = extras[2 + k];
  u.uCutHW.value.set(extras[11], extras[12], extras[13], extras[14]);
  u.cutHW = [extras[11], extras[12], extras[13], extras[14]];
  u.laughHW = extras[12];
  if (extras.length > 16) u.laughSteps = [extras[15], extras[16]];
}

/** Loads the build's curves (22 numbers: two blocks of half width, sigma, 9 samples). */
export function setMouthLines(u: LineUniforms, extras: number[]): void {
  if (extras.length < 22) return;
  u.uLineS.value.x = extras[0];
  u.uLineS.value.z = extras[1];
  for (let k = 0; k < 9; k++) u.uLineSY.value[k] = extras[2 + k];
  u.uLineF.value.x = extras[11];
  u.uLineF.value.z = extras[12];
  for (let k = 0; k < 9; k++) u.uLineFY.value[k] = extras[13 + k];
}

const sample = (name: string): string => `
  {
    float a = abs(vRest.x) / max(${name}.x, 1e-4);
    float k = mix(${name}.w, ${name}.y, smoothstep(-0.012, 0.012, vRest.x));
    if (k > 0.001 && a < 1.0 && vRest.z > 0.06) {
      float t = a * 8.0;
      int i = int(min(floor(t), 7.0));
      float f = t - float(i);
      float y0 = ${name}Y[0], y1 = ${name}Y[1];
      for (int q = 0; q < 8; q++) { if (q == i) { y0 = ${name}Y[q]; y1 = ${name}Y[q + 1]; } }
      float yl = mix(y0, y1, f);
      float w = ${name}.z * (1.0 - 0.5 * a * a);          // the line thins towards its ends
      float d = (vRest.y - yl) / w;
      lineDark = max(lineDark, k * exp(-d * d) * (1.0 - smoothstep(0.84, 1.0, a)));
    }
  }`;

// the cut's line: as far out as the widest open key reaches (each key's weight fades out at its own half width)
const CUT = /* glsl */ `
  {
    float ax = abs(vRest.x);
    vec4 reach = 1.0 - smoothstep(uCutHW * 0.85, uCutHW, vec4(ax));
    float k = max(max(uCutW.x * reach.x, uCutW.y * reach.y), max(uCutW.z * reach.z, uCutW.w * reach.w));
    float a = ax / max(uLineC.x, 1e-4);
    if (k > 0.001 && a < 1.0 && vRest.z > 0.06) {
      float t = a * 8.0;
      int i = int(min(floor(t), 7.0));
      float f = t - float(i);
      float y0 = uLineCY[0], y1 = uLineCY[1];
      for (int q = 0; q < 8; q++) { if (q == i) { y0 = uLineCY[q]; y1 = uLineCY[q + 1]; } }
      float dy = vRest.y - mix(y0, y1, f);
      // thinner on the upper lip: its skin stretches as the lip lifts, and an even line swelled into an 'm'
      float d = dy / (uLineC.z * (dy > 0.0 ? 0.6 : 1.0));
      cutDark = max(cutDark, k * exp(-d * d));
    }
  }`;

/** Adds the lines to a body material's shader (after installEyes: it declares vRest). */
export function installMouthLines(shader: { fragmentShader: string; uniforms: Record<string, unknown> }, u: LineUniforms): void {
  Object.assign(shader.uniforms, u);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec4 uLineS; uniform float uLineSY[9];
uniform vec4 uLineF; uniform float uLineFY[9];
uniform vec4 uLineC; uniform float uLineCY[9];
uniform vec4 uCutW; uniform vec4 uCutHW;`)
    .replace('#include <alphamap_fragment>', `{
  float lineDark = 0.0;${sample('uLineS')}${sample('uLineF')}
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.035, 0.025), 0.88 * lineDark);   // the art's brown smile line
  float cutDark = 0.0;${CUT}
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.025, 0.02), 0.85 * cutDark);   // the art's brown lip line
}
#include <alphamap_fragment>`);
}
