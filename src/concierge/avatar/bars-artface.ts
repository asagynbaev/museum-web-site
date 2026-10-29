// Copied from ai-concierge/web/src/avatar/bars-artface.ts by scripts/export-museum.mjs - edit it there and export again.
// The face of the 3D snow leopard taken from the concept art itself. The model's texture already carries the art
// projected from the front (avatar-bars/gen/build_gen.py --project); here the eyes and the mouth are sampled live
// from the five expression images (public/bars2d, aligned by the body), on the 3D surface: the rest-pose point maps
// linearly to a pixel of the 'wow' art (glTF extra 'art'), and per image an affine map through eyes and nose takes
// that pixel to the same spot of the other expression. Lip sync swaps in the mouth of the image that has the needed
// shape, blinks use the laughing image's closed eyes — as in the 2D engine (bars2d.ts), but the head is 3D.
import * as THREE from 'three';
import type { Emotion } from './emotions';

const IMAGES = ['smug', 'surprised', 'wow', 'laugh', 'angry'] as const;
type Img = (typeof IMAGES)[number];
const IDX: Record<Img, number> = { smug: 0, surprised: 1, wow: 2, laugh: 3, angry: 4 };
type Pt = [number, number];
interface Anchor { eyeL: Pt; eyeR: Pt; nose: Pt; mouth: Pt; mouthR: Pt; fur: [number, number, number] }
interface Meta { size: [number, number]; anchors: Record<Img, Anchor> }

/** Emotion → eyes image, mouth at rest, mouth closed while talking. */
const LOOK: Record<Emotion, { eyes: Img; rest: Img; closed: Img; shut?: boolean }> = {
  calm: { eyes: 'wow', rest: 'smug', closed: 'smug' },
  happy: { eyes: 'laugh', rest: 'smug', closed: 'smug' },
  laugh: { eyes: 'laugh', rest: 'laugh', closed: 'smug' },
  surprised: { eyes: 'surprised', rest: 'surprised', closed: 'smug' },
  wow: { eyes: 'wow', rest: 'wow', closed: 'smug' },
  smug: { eyes: 'smug', rest: 'smug', closed: 'smug' },
  angry: { eyes: 'angry', rest: 'angry', closed: 'angry' },
  sad: { eyes: 'wow', rest: 'angry', closed: 'angry' },
  thinking: { eyes: 'smug', rest: 'smug', closed: 'smug' },
};

export const ART_FACE_DECL = /* glsl */ `
uniform float uArtOn;
uniform float uArtMouthOn;     // 0: the model has its own (sculpted) mouth, only the eyes come from the art
uniform vec4 uArtMap;          // art_x = x0 + kx * x, art_y = y0 + ky * y (rest pose)
uniform vec2 uArtSize;
uniform vec4 uArtEyeL, uArtEyeR, uArtMouthWow;   // masks in 'wow' pixels: cx, cy, rx, ry
uniform vec4 uArtCoreL, uArtCoreR;               // the eyeballs themselves (inside the liner)
float artEll(vec2 p, vec4 e) { return length((p - e.xy) / e.zw); }
vec2 artPx(vec3 r) { return vec2(uArtMap.x + uArtMap.y * r.x, uArtMap.z + uArtMap.w * r.y); }
/** 1 where the art's eyes or mouth are drawn on the face (fur keeps clear, painted features are replaced). */
float artFaceMask(vec3 r) {
  if (uArtOn < 0.5 || r.z < 0.02) return 0.0;
  vec2 p = artPx(r);
  // a soft falloff (no edge where the fur stops): the art's own fur continues the coat around the features
  // no strands over the eye patch or its rim (they would speckle the eye); fur returns past 1.5 radii
  float m = 1.0 - smoothstep(1.05, 1.5, min(artEll(p, uArtEyeL), artEll(p, uArtEyeR)));
  if (uArtMouthOn > 0.5) m = max(m, 1.0 - smoothstep(1.05, 1.5, artEll(p, uArtMouthWow)));
  return m;
}
`;

export const ART_FACE_FRAG_DECL = /* glsl */ `
uniform sampler2D uArt0, uArt1, uArt2, uArt3, uArt4;
uniform sampler2D uArtM0, uArtM1, uArtM2, uArtM3, uArtM4;   // eye masks (prepare.py)
uniform float uArtExposure;                                 // unlit art -> the scene's lit fur level
uniform mat3 uArtA[5];
uniform float uArtEyeW[5];
uniform float uArtMouthW[5];
uniform vec4 uArtMouth[5];
uniform vec3 uArtTint[5];
uniform vec3 uArtBase;         // base texture fur / art fur (so the patches blend into the model's own texture)
uniform vec3 uArtFur;          // the art's own fur colour (linear): only what differs from it is taken from the art
// Eye features: much darker than the fur (liner, lashes, brows, iris) or brighter (sclera, highlights). Mid tones
// (the art's own spots, shading) are left to the model's texture.
float artFeature(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float lf = dot(uArtFur, vec3(0.299, 0.587, 0.114));
  // the liner, lashes and iris are far darker than the fur; the art's own fur strokes (0.75–0.9 of it) must not pass
  return max(smoothstep(0.02, 0.16, (lf * 0.62 - l) / lf), smoothstep(0.03, 0.12, (l - lf * 1.06) / lf));
}
uniform float uArtBlink;
vec3 artTex(int i, vec2 px) {
  vec2 uv = vec2(px.x / uArtSize.x, 1.0 - px.y / uArtSize.y);
  if (i == 0) return texture2D(uArt0, uv).rgb;
  if (i == 1) return texture2D(uArt1, uv).rgb;
  if (i == 2) return texture2D(uArt2, uv).rgb;
  if (i == 3) return texture2D(uArt3, uv).rgb;
  return texture2D(uArt4, uv).rgb;
}
float artMask(int i, vec2 px) {
  vec2 uv = vec2(px.x / uArtSize.x, 1.0 - px.y / uArtSize.y);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  if (i == 0) return texture2D(uArtM0, uv).r;
  if (i == 1) return texture2D(uArtM1, uv).r;
  if (i == 2) return texture2D(uArtM2, uv).r;
  if (i == 3) return texture2D(uArtM3, uv).r;
  return texture2D(uArtM4, uv).r;
}
vec2 artMap(int i, vec2 p) {
  mat3 A = uArtA[0];
  if (i == 1) A = uArtA[1];
  if (i == 2) A = uArtA[2];
  if (i == 3) A = uArtA[3];
  if (i == 4) A = uArtA[4];
  return (A * vec3(p, 1.0)).xy;
}
`;

export const ART_FACE_FRAG = /* glsl */ `
if (uArtOn > 0.5 && vRest.z > 0.02) {
  vec2 p = artPx(vRest);
  // eyes: the expression's own eyes, cross-faded between images
  float eyeD = min(artEll(p, uArtEyeL), artEll(p, uArtEyeR));
  float em = 1.0 - smoothstep(0.85, 1.0, eyeD);
  if (em > 0.0) {
    vec3 acc = vec3(0.0);
    float W = 0.0;
    float M = 0.0;
    for (int i = 0; i < 5; i++) {
      float w = uArtEyeW[i];
      if (w < 0.002) continue;
      vec2 pi = artMap(i, p);
      acc += w * artTex(i, pi) * uArtTint[i];
      M += w * artMask(i, pi);
      W += w;
    }
    // inside the eyeball everything comes from the art (iris, sclera, its painted sheen — a luminance test there
    // let the fur show through the lighter parts of the iris); around it only the features (liner, wings, brows),
    // plain fur between them stays the model's own texture; a blink fades the open eye out and draws closed lids
    if (W > 0.0) {
      vec3 c = acc / W;
      // the art's eye mask says what is eye (liner, wings, brows, sclera, iris); the art carries its own painted
      // lighting, so the eye is shown unlit (emissive at the fur's lit level), not shaded by the scene lights
      float take = em * (M / W) * (1.0 - uArtBlink);
      totalEmissiveRadiance += c * uArtBase * uArtExposure * take;
      diffuseColor.rgb *= 1.0 - take;
    }
    // no real gloss on the eye: the art paints its own highlights; a specular crescent on top looked wrong
    if (uArtBlink > 0.002) {
      // closed eye: a soft dark arc where the lids meet (a relaxed "‿"), in the eye's own frame (art pixels, y down)
      vec4 E = artEll(p, uArtEyeL) < artEll(p, uArtEyeR) ? uArtEyeL : uArtEyeR;
      vec2 q = (p - E.xy) / vec2(E.z, E.w);
      float x2 = q.x * q.x;
      float yc = 0.02 + 0.26 * (1.0 - x2);
      float t = 0.055 * (1.0 - 0.45 * x2);
      float d = abs(q.y - yc) - t;
      float a = (1.0 - smoothstep(-0.02, 0.05, d)) * (1.0 - smoothstep(0.86, 1.0, abs(q.x))) * uArtBlink;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.022, 0.018), a);
    }
  }
  // mouth: the mouth of the image with the needed shape; it also covers the face's own mouth area
  float own = uArtMouthOn > 0.5 ? 1.0 - smoothstep(0.62, 1.0, artEll(p, uArtMouthWow)) : 0.0;
  vec3 macc = vec3(0.0);
  float M = 0.0;
  for (int i = 0; i < 5; i++) {
    float w = uArtMouthW[i];
    if (w < 0.002) continue;
    vec2 si = artMap(i, p);
    vec4 e = uArtMouth[0];
    if (i == 1) e = uArtMouth[1];
    if (i == 2) e = uArtMouth[2];
    if (i == 3) e = uArtMouth[3];
    if (i == 4) e = uArtMouth[4];
    float m = w * max(1.0 - smoothstep(0.62, 1.0, artEll(si, e)), own);
    macc += m * artTex(i, si) * uArtTint[i] * uArtBase;
    M += m;
  }
  if (M > 0.0) diffuseColor.rgb = diffuseColor.rgb * (1.0 - min(M, 1.0)) + macc / max(M, 1.0);
}
`;

class Spring {
  value = 0;
  private vel = 0;
  constructor(private readonly omega: number) {}
  step(target: number, dt: number): number {
    const w = this.omega;
    const x = this.value - target;
    const e = Math.exp(-w * dt);
    const v = this.vel;
    this.value = target + (x + (v + w * x) * dt) * e;
    this.vel = (v - w * (v + w * x) * dt) * e;
    return this.value;
  }
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Affine map (Matrix3) taking points `from` onto `to`. */
function affine(from: Pt[], to: Pt[]): THREE.Matrix3 {
  const F = new THREE.Matrix3().set(from[0][0], from[1][0], from[2][0], from[0][1], from[1][1], from[2][1], 1, 1, 1);
  const T = new THREE.Matrix3().set(to[0][0], to[1][0], to[2][0], to[0][1], to[1][1], to[2][1], 1, 1, 1);
  return new THREE.Matrix3().multiplyMatrices(T, F.invert());
}

export interface ArtFaceUniforms { [k: string]: { value: unknown } }

export class ArtFace {
  readonly uniforms: ArtFaceUniforms;
  private eyeW = IMAGES.map(() => new Spring(9));
  private mouthW = IMAGES.map(() => new Spring(26));
  private shut = 0;
  private blinkAt = -1;
  private blinkNext = 2.5;
  private t = 0;
  private first = true;
  /** The art also supplies the mouths (a model without a usable sculpted mouth); false = eyes only. */
  readonly mouths: boolean;

  private constructor(meta: Meta, texs: THREE.Texture[], masks: THREE.Texture[], map: number[], mouths: boolean, base: number[]) {
    this.mouths = mouths;
    const a = meta.anchors;
    const tri = (n: Img): Pt[] => [a[n].eyeL, a[n].eyeR, a[n].nose];
    const fur = (n: Img) => a[n].fur;
    this.eyeW.forEach((s, i) => (s.value = IMAGES[i] === 'wow' ? 1 : 0));
    this.uniforms = {
      uArtOn: { value: 1 },
      uArtMouthOn: { value: mouths ? 1 : 0 },
      uArtBase: { value: new THREE.Vector3(base[0], base[1], base[2]) },
      uArtFur: { value: new THREE.Vector3(...fur('wow').map(toLinear)) },
      uArtMap: { value: new THREE.Vector4(map[0], map[1], map[2], map[3]) },
      uArtSize: { value: new THREE.Vector2(meta.size[0], meta.size[1]) },
      // the eye patch: eye + lashes + brows (angry), a little fur around; feathered in the shader
      // generous: the per-art eye masks decide what is eye; this only bounds the lookup
      uArtEyeL: { value: new THREE.Vector4(a.wow.eyeL[0] - 10, a.wow.eyeL[1] - 10, 125, 105) },
      uArtEyeR: { value: new THREE.Vector4(a.wow.eyeR[0] + 10, a.wow.eyeR[1] - 10, 125, 105) },
      // the widest mouth (laugh) must fit: the base face's own mouth area that a swapped-in mouth covers
      uArtMouthWow: { value: new THREE.Vector4(a.wow.mouth[0], a.wow.mouth[1] + 18, 108, 84) },
      uArtCoreL: { value: new THREE.Vector4(a.wow.eyeL[0], a.wow.eyeL[1], 56, 54) },
      uArtCoreR: { value: new THREE.Vector4(a.wow.eyeR[0], a.wow.eyeR[1], 56, 54) },
      uArt0: { value: texs[0] }, uArt1: { value: texs[1] }, uArt2: { value: texs[2] },
      uArt3: { value: texs[3] }, uArt4: { value: texs[4] },
      uArtM0: { value: masks[0] }, uArtM1: { value: masks[1] }, uArtM2: { value: masks[2] },
      uArtM3: { value: masks[3] }, uArtM4: { value: masks[4] },
      uArtExposure: { value: 1.2 },
      uArtA: { value: IMAGES.map((n) => affine(tri('wow'), tri(n))) },
      uArtEyeW: { value: IMAGES.map((n) => (n === 'wow' ? 1 : 0)) },
      uArtMouthW: { value: IMAGES.map(() => 0) },
      uArtMouth: { value: IMAGES.map((n) => new THREE.Vector4(a[n].mouth[0], a[n].mouth[1], a[n].mouthR[0], a[n].mouthR[1])) },
      // a swapped-in feature takes the fur tint of the base face (the images differ a little in colour)
      uArtTint: { value: IMAGES.map((n) => new THREE.Vector3(fur('wow')[0] / fur(n)[0], fur('wow')[1] / fur(n)[1], fur('wow')[2] / fur(n)[2])) },
      uArtBlink: { value: 0 },
    };
  }

  static async load(base: string, map: number[], mouths = true, tint: number[] = [1, 1, 1]): Promise<ArtFace> {
    const meta = (await (await fetch(`${base}/anchors.json`)).json()) as Meta;
    const loader = new THREE.TextureLoader();
    const texs = await Promise.all(IMAGES.map((n) => loader.loadAsync(`${base}/${n}.jpg`)));
    for (const t of texs) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
    const masks = await Promise.all(IMAGES.map((n) => loader.loadAsync(`${base}/mask_${n}.png`)));
    for (const t of masks) {
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
    }
    return new ArtFace(meta, texs, masks, map, mouths, tint);
  }

  /** Debug: hold the eyes closed by this much (?blink=1). */
  forceBlink = 0;

  /** open/round: mouth from speech (0..1); speaking: the voice is sounding. */
  update(dt: number, emotion: Emotion, open: number, round: number, speaking: boolean): void {
    this.t += dt;
    const look = LOOK[emotion];
    const ew = this.uniforms.uArtEyeW.value as number[];
    const target = IMAGES.map((n) => (n === look.eyes ? 1 : 0));
    if (this.first) this.eyeW.forEach((s, i) => (s.value = target[i]));   // the first frame starts settled
    this.eyeW.forEach((s, i) => (ew[i] = Math.max(0, Math.min(1, s.step(target[i], dt)))));
    const mw = this.uniforms.uArtMouthW.value as number[];
    const m = IMAGES.map(() => 0);
    if (!this.mouths) {
      /* the sculpted mouth talks; nothing painted */
    } else if (speaking) {
      const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      const wide = ease((open - 0.55) / 0.3) * (1 - round);
      const big = ease((open - 0.3) / 0.3) * (1 - wide);
      const small = ease((open - 0.08) / 0.22) * (1 - big - wide);
      m[IDX.laugh] += wide;
      m[IDX.surprised] += big;
      m[IDX.wow] += small;
      m[IDX[look.closed]] += Math.max(0, 1 - wide - big - small);
    } else {
      m[IDX[look.rest]] = 1;
    }
    if (this.first) this.mouthW.forEach((s, i) => (s.value = m[i]));
    this.first = false;
    this.mouthW.forEach((s, i) => (mw[i] = Math.max(0, Math.min(1, s.step(m[i], dt)))));
    // blinks, and the closed '^^' eyes for 'happy'
    if (this.t > this.blinkNext) {
      if (look.eyes !== 'laugh') this.blinkAt = this.t;
      this.blinkNext = this.t + 2.4 + Math.random() * 3.8;
    }
    const bt = (this.t - this.blinkAt) / 0.17;
    const blink = bt >= 0 && bt < 1 ? Math.sin(bt * Math.PI) ** 0.7 : 0;
    this.shut += ((look.shut ? 1 : 0) - this.shut) * Math.min(1, dt * 10);
    this.uniforms.uArtBlink.value = Math.max(blink, this.shut, this.forceBlink);
  }
}
