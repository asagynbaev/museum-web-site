// Copied from ai-concierge/web/src/avatar/bars-eyes.ts by scripts/export-museum.mjs - edit it there and export again.
// Procedural eyes for the snow leopard, drawn by the body material itself (the sculpt only has closed eyelids,
// which the build fills in). Each eye is shaped by a few parameters, so every emotion — closed "‿", laughing "^^",
// wide and round, half-lidded and smug, angry with slanted lids and brows — is just a set of numbers that animate
// smoothly. Drawn in the model's rest pose coordinates (front projection), so the eyes stay glued to the face
// while it is skinned and morphed.
import * as THREE from 'three';

export interface EyeParams {
  /** 0 closed … 1 open. */
  open: number;
  /** Bigger eye and pupil (surprise), 0…1. */
  wide: number;
  /** Lower lid raised (smug, happy squint), 0…1. */
  squint: number;
  /** Upper lid slant: > 0 angry (inner corner down), < 0 sad (inner corner up). */
  tilt: number;
  /** Closed-eye curve: 0 relaxed "‿", 1 laughing "^". */
  happy: number;
  /** Gaze, -1…1: x outward (away from the nose), y up. */
  lookX: number;
  lookY: number;
  /** Brow: opacity, raise (-1…1), slant in radians (> 0 inner end down). */
  browAlpha: number;
  browRaise: number;
  browTilt: number;
}

export const eyeDefaults = (): EyeParams => ({
  open: 0, wide: 0, squint: 0, tilt: 0, happy: 0, lookX: 0, lookY: 0, browAlpha: 0, browRaise: 0, browTilt: 0,
});

/** Eye placement in the model (three.js rest coordinates: x right, y up, z front). */
export const EYE_GEOMETRY = { cx: 0.126, cy: 0.726, radius: 0.053 };

export interface EyeUniforms {
  uEyeA: { value: THREE.Vector4[] };
  uEyeB: { value: THREE.Vector4[] };
  uBrow: { value: THREE.Vector4[] };
  uEyeGeo: { value: THREE.Vector3 };
  /** Painted mouth: lip line z at |x| = 0..hw (9 samples) and (hw, open, round, wide); hw = 0 turns it off. */
  uMouthZ: { value: number[] };
  uMouthP: { value: THREE.Vector4 };
  /** Nose leather outline in rest (x, y): rounded triangle a, b (uNose1) and c, rounding, on (uNose2). */
  uNose1: { value: THREE.Vector4 };
  uNose2: { value: THREE.Vector4 };
}

export const MOUTH_GLSL = /* glsl */ `
// ---- painted mouth (models whose mouth is not cut open): the opening hangs under the lip line ----
uniform float uMouthZ[9];   // lip line height at |x| = 0 .. hw (rest pose)
uniform vec4 uMouthP;       // hw (0 = no painted mouth), open, round, wide
float barsLipZ(float ax) {
  float t = clamp(ax / max(uMouthP.x, 1e-4), 0.0, 1.0) * 8.0;
  int i = int(min(floor(t), 7.0));
  float f = t - float(i);
  float a = uMouthZ[0], b = uMouthZ[1];
  for (int k = 0; k < 8; k++) { if (k == i) { a = uMouthZ[k]; b = uMouthZ[k + 1]; } }
  return mix(a, b, f);
}
// opening geometry at a rest point: x half-width, depth (metres, rest space)
void barsMouthShape(out float W, out float D) {
  float o = uMouthP.y, r = uMouthP.z, w = uMouthP.w;
  W = uMouthP.x * mix(0.35 + 0.3 * w, 0.05 + 0.3 * o, r);
  D = o * mix(0.05, 0.085, r);   // rest-space depth: part of it hides in the fold under the pads
}
// signed distance-ish (metres): < 0 inside the opening
float barsMouthDist(vec3 p) {
  float W, D;
  barsMouthShape(W, D);
  float top = barsLipZ(abs(p.x)) + 0.0015;
  float u = clamp(abs(p.x) / max(W, 1e-4), 0.0, 1.0);
  float bot = top - D * pow(max(1.0 - u * u, 0.0), 0.5 + 0.3 * uMouthP.z) - 0.0015;
  return max(max(p.y - top, bot - p.y), abs(p.x) - W);
}
float barsMouthFur(vec3 p) {
  if (uMouthP.x <= 0.0 || uMouthP.y < 0.01 || p.z < 0.06) return 1.0;
  return smoothstep(0.0, 0.004, barsMouthDist(p));
}
`;

export function setEyes(u: EyeUniforms, left: EyeParams, right: EyeParams): void {
  // index 0 = the character's left eye (+x), 1 = its right eye (-x)
  [left, right].forEach((p, i) => {
    u.uEyeA.value[i].set(p.open, p.wide, p.squint, p.tilt);
    u.uEyeB.value[i].set(p.happy, p.lookX, p.lookY, 0);
    u.uBrow.value[i].set(p.browAlpha, p.browRaise, p.browTilt, 0);
  });
}

export const EYE_SHAPE_GLSL = /* glsl */ `
// ---- eye opening, shared by the drawing and the fur mask ----
// Units: eye radius = 1, x outward. Soft almond: an ellipse cut by two curved lids, all joins rounded (smooth max),
// so no expression or transition ever shows a hard corner.
float eSmax(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float barsEyeShape(vec2 q, vec4 A, out float yU, out float yL, out float s) {
  float open = A.x, wide = A.y, squint = A.z, tilt = clamp(A.w, -1.0, 1.0);
  s = 1.0 + 0.08 * wide;
  float x = clamp(q.x / s, -1.2, 1.2);
  // upper lid: an arch; angry lowers its inner half, sad lifts the inner end a little and lets the outer droop
  yU = (mix(-0.15, 0.95, open) - 0.32 * x * x
        - max(tilt, 0.0) * 0.55 * smoothstep(1.0, -1.0, x)
        - max(-tilt, 0.0) * 0.25 * smoothstep(-1.0, 1.0, x)) * s;
  // lower lid: curves up towards the corners, rises with a squint (smug, happy)
  yL = (-0.92 + 0.28 * x * x + squint * 0.55) * s;
  float dEll = (length(q / vec2(1.08, 1.0) / s) - 1.0) * s;
  return eSmax(dEll, eSmax(q.y - yU, yL - q.y, 0.2 * s), 0.18 * s);
}
float barsLinerW(vec2 q, float yU, float yL, float s) {
  float top = smoothstep(-0.25, 0.25, q.y - (yU + yL) * 0.5);
  float x = clamp(q.x / s, -1.0, 1.0);
  // heavy along the upper lid, tapering to the corners; a fine line below
  return mix(0.045, 0.08 + 0.17 * (1.0 - 0.55 * x * x) + 0.04 * smoothstep(0.2, 0.9, x), top) * s;
}
`;

const DECL = /* glsl */ `
uniform vec4 uEyeA[2];
uniform vec4 uEyeB[2];
uniform vec4 uBrow[2];
uniform vec3 uEyeGeo;
varying vec3 vRest;
${MOUTH_GLSL}

float aaStep(float d) { float w = fwidth(d) * 0.75 + 1e-4; return 1.0 - smoothstep(-w, w, d); }
${EYE_SHAPE_GLSL}


// Eye in local units (radius = 1), x outward. Returns premultiplied colour + alpha; gloss/glow for the shading.
vec4 barsEye(vec2 q, vec4 A, vec4 B, vec4 Br, float side, out float gloss, out float glow) {
  float open = A.x, wide = A.y;
  float happy = B.x;
  vec2 look = clamp(B.yz, vec2(-1.0), vec2(1.0));
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  gloss = 0.0;
  glow = 0.0;
  float yU, yL, s;
  float dIn = barsEyeShape(q, A, yU, yL, s);   // < 0 inside the visible eye
  float vis = smoothstep(0.02, 0.14, open);
  if (vis > 0.0 && dIn < 0.5 * s) {
    float lw = barsLinerW(q, yU, yL, s);
    float ring = aaStep(dIn - lw) * vis;
    // a small lash flick out of the outer corner, following the upper lid
    float x1 = 1.0 * s;
    float yU1 = (mix(-0.15, 0.95, open) - 0.32) * s;
    vec2 w0 = vec2(x1 * 0.97, mix((-0.92 + 0.28 + A.z * 0.55) * s, yU1, 0.7));
    vec2 wd = vec2(0.3, 0.17) * s;
    float h = clamp(dot(q - w0, wd) / dot(wd, wd), 0.0, 1.0);
    float wing = aaStep(length(q - w0 - wd * h) - 0.075 * s * (1.0 - h)) * vis * smoothstep(0.35, 0.6, open);
    float la = max(ring, wing);
    vec3 liner = vec3(0.045, 0.03, 0.025);
    col = liner * la;
    alpha = la;

    float inside = aaStep(dIn) * vis;
    // the iris sits high, tucked under the upper lid: never a white crescent above or below it
    vec2 c = vec2(look.x * 0.14, 0.05 + look.y * 0.08) * s;
    float ri = 0.8 * s;
    float d = length(q - c) / ri;
    vec3 iris = mix(vec3(0.42, 0.13, 0.016), vec3(0.07, 0.02, 0.005), smoothstep(0.3, 0.97, d));
    iris += vec3(0.33, 0.14, 0.03) * smoothstep(0.0, 0.9, -(q.y - c.y) / ri) * (1.0 - smoothstep(0.6, 0.95, d));
    iris = mix(iris, vec3(0.05, 0.02, 0.008), smoothstep(0.88, 0.98, d));
    float rp = (0.42 + 0.1 * wide) * s / ri;
    iris = mix(iris, vec3(0.012, 0.009, 0.007), aaStep(d - rp));
    vec3 sclera = vec3(0.93, 0.91, 0.88) * mix(0.72, 1.0, smoothstep(-0.1, 0.5, yU - q.y));
    vec3 eyeCol = mix(sclera, iris, aaStep(d - 1.0));
    // soft shadow of the upper lid over the eye
    eyeCol *= mix(0.62, 1.0, smoothstep(0.0, 0.35 * s, yU - q.y));
    // highlights (towards the viewer's upper right)
    float h1 = aaStep(length(q - c - vec2(0.24 * side, 0.26) * s) - 0.19 * s);
    float h2 = aaStep(length(q - c - vec2(-0.22 * side, -0.28) * s) - 0.075 * s);
    float hl = max(h1, h2 * 0.85);
    eyeCol = mix(eyeCol, vec3(1.0), hl);
    glow = (hl * 0.55 + 0.08 * (1.0 - aaStep(d - 1.0))) * inside;
    col = col * (1.0 - inside) + eyeCol * inside;
    alpha = max(alpha, inside);
    gloss = inside;
  }

  // --- closed eye: a soft dark arc, "‿" when relaxed, "^" when laughing
  float closed = 1.0 - smoothstep(0.03, 0.16, open);
  if (closed > 0.0) {
    float x2 = q.x * q.x;
    float yc = mix(0.42 * x2 - 0.3, -0.55 * x2 + 0.3, happy) * s;
    float t = (0.12 + 0.02 * happy) * (1.0 - 0.6 * x2) * s;
    float d = abs(q.y - yc) - t;
    float a = aaStep(d) * (1.0 - smoothstep(0.88, 1.02, abs(q.x))) * closed;
    // a small upward flick at the outer end (lashes)
    float flick = aaStep(length(q - vec2(1.0, yc + 0.06 * s)) - 0.07 * s) * smoothstep(0.85, 1.0, q.x);
    a = max(a, flick * closed * 0.9);
    vec3 lc = vec3(0.11, 0.06, 0.045);
    col = col * (1.0 - a) + lc * a;
    alpha = max(alpha, a);
  }

  // --- brow: a soft dark dash above the eye (the spots there act as brows on the reference)
  if (Br.x > 0.0) {
    float ang = Br.z;
    vec2 bc = vec2(0.0, 1.3 + 0.38 * Br.y);
    vec2 p = q - bc;
    p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;   // brow frame: ang > 0 puts the inner end down
    float d = length(vec2(max(abs(p.x) - 0.42, 0.0), p.y)) - 0.12 * (1.0 - 0.35 * smoothstep(0.0, 0.42, p.x));
    float a = (1.0 - smoothstep(-0.02, 0.035, d)) * Br.x;
    vec3 bcCol = vec3(0.2, 0.11, 0.08);
    col = col * (1.0 - a) + bcCol * a;
    alpha = max(alpha, a);
  }
  return vec4(col, alpha);
}
`;

const NOSE_GLSL = /* glsl */ `
uniform vec4 uNose1, uNose2;
float barsSdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
               vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
/** 1 on the nose leather (glossy skin), 0 on the fur — the same outline the texture paints. */
float barsNose(vec3 r) {
  if (uNose2.w < 0.5 || r.z < 0.1) return 0.0;
  float d = barsSdTri(r.xy, uNose1.xy, uNose1.zw, uNose2.xy) - uNose2.z;
  return 1.0 - smoothstep(-0.004, 0.0, d);
}
`;

const FRAG = /* glsl */ `
#include <map_fragment>
float barsGloss = 0.0;
barsGloss = 0.75 * barsNose(vRest);
{
  float front = smoothstep(0.02, 0.07, vRest.z);
  if (front > 0.0) {
    int i = vRest.x > 0.0 ? 0 : 1;
    float side = vRest.x > 0.0 ? 1.0 : -1.0;
    vec2 q = vec2(abs(vRest.x) - uEyeGeo.x, vRest.y - uEyeGeo.y) / uEyeGeo.z;
    if (abs(q.x) < 2.2 && q.y > -1.8 && q.y < 2.4) {
      float gloss, glow;
      vec4 eye = barsEye(q, uEyeA[i], uEyeB[i], uBrow[i], side, gloss, glow);
      float a = eye.a * front;
      diffuseColor.rgb = diffuseColor.rgb * (1.0 - a) + eye.rgb * front;
      barsGloss = gloss * front;
      totalEmissiveRadiance += vec3(glow * front);
    }
  }
  // painted mouth: dark inside, a pink tongue on its floor, a soft brown lip edge
  if (uMouthP.x > 0.0 && uMouthP.y > 0.01 && vRest.z > 0.06) {
    float d = barsMouthDist(vRest);
    float aw = fwidth(d) * 0.8 + 1e-5;
    float inside = 1.0 - smoothstep(-aw, aw, d);
    float edge = (1.0 - smoothstep(-aw, aw, d - 0.0012)) * (1.0 - inside);
    if (inside + edge > 0.0) {
      float W, D;
      barsMouthShape(W, D);
      float top = barsLipZ(abs(vRest.x));
      float t = clamp((top - vRest.y) / max(D, 1e-4), 0.0, 1.0);       // 0 at the lip, 1 at the bottom
      vec3 inner = mix(vec3(0.10, 0.02, 0.025), vec3(0.32, 0.07, 0.08), t);
      vec2 tq = vec2(vRest.x / max(W * 0.62, 1e-4), (vRest.y - (top - D * 0.8)) / max(D * 0.42, 1e-4));
      float tongue = 1.0 - smoothstep(0.85, 1.0, length(tq));
      vec3 tc = mix(vec3(0.78, 0.33, 0.38), vec3(0.95, 0.52, 0.56), smoothstep(0.6, -0.4, tq.y));
      inner = mix(inner, tc, tongue * smoothstep(0.1, 0.4, uMouthP.y));
      vec3 lip = vec3(0.30, 0.16, 0.14);
      diffuseColor.rgb = mix(diffuseColor.rgb, lip, edge * 0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, inner, inside);
      barsGloss = max(barsGloss, inside * tongue * 0.6);
    }
  }
}
`;

/**
 * For the fur shells: how much fur may grow at a rest-pose point, given the current eye shapes (0 on the eye and
 * its lash line, fur right outside it; over a half-closed lid the fur covers the lid as it should).
 */
export const EYE_FUR_GLSL = /* glsl */ `
uniform vec4 uEyeA[2];
uniform vec4 uEyeB[2];
uniform vec3 uEyeGeo;
${MOUTH_GLSL}
${EYE_SHAPE_GLSL}
float barsEyeFur(vec3 r) {
  if (r.z < 0.02) return 1.0;
  int i = r.x > 0.0 ? 0 : 1;
  vec2 q = vec2(abs(r.x) - uEyeGeo.x, r.y - uEyeGeo.y) / uEyeGeo.z;
  if (abs(q.x) > 2.0 || abs(q.y) > 2.2) return 1.0;
  vec4 A = uEyeA[i];
  float open = A.x;
  float yU, yL, s;
  float dIn = barsEyeShape(q, A, yU, yL, s);
  // fur starts on the outer part of the liner: no bare ring around the eye
  float lw = barsLinerW(q, yU, yL, s);
  float keepOpen = smoothstep(lw * 0.5, lw * 1.0, dIn);
  float x2 = q.x * q.x;
  float yc = mix(0.42 * x2 - 0.3, -0.55 * x2 + 0.3, uEyeB[i].x) * s;
  float dl = max(abs(q.y - yc) - 0.14 * s, abs(q.x) - 1.05 * s);
  float keepClosed = smoothstep(0.04 * s, 0.25 * s, dl);
  return mix(keepClosed, keepOpen, smoothstep(0.03, 0.16, open));
}
`;

/** Adds the eyes to a MeshStandard/Physical material; returns the uniforms to drive them. */
export function installEyes(material: THREE.MeshStandardMaterial): EyeUniforms {
  const uniforms: EyeUniforms = {
    uEyeA: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uEyeB: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uBrow: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uEyeGeo: { value: new THREE.Vector3(EYE_GEOMETRY.cx, EYE_GEOMETRY.cy, EYE_GEOMETRY.radius) },
    uMouthZ: { value: new Array(9).fill(0) },
    uMouthP: { value: new THREE.Vector4(0, 0, 0, 0) },
    uNose1: { value: new THREE.Vector4() },
    uNose2: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${NOSE_GLSL}`)
      .replace('#include <map_fragment>', FRAG)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, barsGloss);',
      );
  };
  material.customProgramCacheKey = () => 'bars-eyes';
  return uniforms;
}
