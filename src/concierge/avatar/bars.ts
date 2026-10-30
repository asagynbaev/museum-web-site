// Copied from ai-concierge/web/src/avatar/bars.ts by scripts/export-museum.mjs - edit it there and export again.
// Snow leopard ("Барс"): a stylised 3D figure (avatar-bars/build.py turns the static sculpt into a rigged GLB with
// mouth morph targets) rendered here with three.js. Lip sync reuses the talking-avatar SDK's visemes, which the SDK
// computes for the audio being heard right now; everything else (breathing, head, ears, tail) is procedural.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { TalkingAvatar } from '@interviewflowai/talking-avatar';
import { eyeDefaults, installEyes, setEyes, type EyeParams, type EyeUniforms } from './bars-eyes';
import { FUR_DEFAULTS, furRootShading, growFur, type FurOptions } from './bars-fur';
import { ART_FACE_DECL, ART_FACE_FRAG, ART_FACE_FRAG_DECL, ArtFace } from './bars-artface';
import { installMouthLines, lineUniforms, setMouthCut, setMouthLines } from './bars-lines';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { Emotion } from './emotions';
import type { Expression } from './emotions';

type Mode = 'speaking' | 'listening' | 'thinking';
interface FrameSource {
  getFrame(): { visemes: Record<string, number>; mode: Mode };
}

/** The SDK's renderer keeps a getFrame() closure with the current visemes; reuse it as our viseme source. */
function frameSource(avatar: TalkingAvatar): FrameSource | null {
  const r = (avatar as unknown as { renderer?: { getFrame?: FrameSource['getFrame'] } }).renderer;
  return r && typeof r.getFrame === 'function' ? (r as FrameSource) : null;
}

/** Oculus viseme → [jawOpen, mouthWide, mouthRound] of the leopard's mouth. */
const VISEMES: Record<string, [number, number, number]> = {
  viseme_sil: [0, 0, 0],
  viseme_PP: [0, 0, 0.1],
  viseme_FF: [0.12, 0.25, 0],
  viseme_TH: [0.25, 0.1, 0],
  viseme_DD: [0.32, 0.15, 0],
  viseme_kk: [0.38, 0.1, 0],
  viseme_CH: [0.28, 0, 0.45],
  viseme_SS: [0.16, 0.45, 0],
  viseme_nn: [0.22, 0.1, 0],
  viseme_RR: [0.3, 0, 0.4],
  viseme_aa: [0.92, 0.25, 0],
  viseme_E: [0.55, 0.55, 0],
  viseme_I: [0.35, 0.65, 0],
  viseme_O: [0.68, 0, 0.75],
  viseme_U: [0.35, 0, 0.9],
};

export interface BarsFraming {
  /** Model height as a fraction of the view height. */
  fill: number;
  /** Where the model's centre lands vertically (0.5 = middle, larger = lower). */
  centerY: number;
  /** Camera height above the model's centre, degrees of pitch (positive = looking down). */
  pitch: number;
  /** Camera orbit around the model, degrees (0 = front, 180 = back). */
  yaw?: number;
}

/** Critically damped spring toward a target (frame-rate independent). */
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

/** Smooth 1D value noise in [-1, 1]. */
function noise(t: number, seed: number): number {
  const h = (i: number): number => {
    const s = Math.sin((i + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

interface BoneRig {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** World axes expressed in the bone's parent space (rotations are applied there, about the bone's pivot). */
  axes: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };
}

const DEG = Math.PI / 180;

/**
 * Render quality steps, best first: the render resolution (a share of the screen's pixel ratio), the AO pass, the key
 * light's soft shadow (VSM map size and blur samples - the blur alone reads the map 2 × size² × samples times a frame;
 * 0 = no cast shadows, the contact blob stays), the share of fur cards drawn and a frame cap (0 = the screen's rate).
 */
const QUALITY = [
  { scale: 1, ao: true, shadow: 2048, blur: 20, fur: 1, fps: 0 },
  { scale: 0.75, ao: true, shadow: 2048, blur: 20, fur: 1, fps: 0 },
  { scale: 0.75, ao: false, shadow: 1024, blur: 12, fur: 1, fps: 0 },
  { scale: 0.6, ao: false, shadow: 1024, blur: 12, fur: 0.6, fps: 0 },
  { scale: 0.5, ao: false, shadow: 512, blur: 8, fur: 0.4, fps: 30 },
  { scale: 0.4, ao: false, shadow: 0, blur: 0, fur: 0.25, fps: 30 },
] as const;
/** A mean frame longer than this (under ~47 fps; a 50 Hz screen gives 20 ms) steps the quality down. */
const SLOW_FRAME_MS = 21;
/**
 * GPUs that start at WEAK_START (and without MSAA) instead of stepping down from the top for ~15 s of stutter: Intel
 * HD / UHD integrated graphics (a museum kiosk's i5-4460 with HD 4600 ran at 99 %), software and old mobile GPUs.
 */
const WEAK_GPU = /Intel.*\b(HD|UHD) Graphics|SwiftShader|llvmpipe|Microsoft Basic Render|Mali|Adreno \(TM\) [3-6]\d\d|PowerVR/i;
const WEAK_START = 4;

/** The GPU's name (unmasked where the browser allows), from a throwaway context. */
function gpuName(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}

/**
 * Reorders a card mesh's triangles card by card (a card = a connected piece) in a fixed random order: drawing the
 * first part of the index buffer (setDrawRange) then thins the coat evenly instead of baring one region, and each
 * card's vertices stay together for the vertex cache.
 */
function shuffleCards(geo: THREE.BufferGeometry): number {
  const index = geo.index;
  if (!index) return 0;
  const idx = index.array as Uint32Array | Uint16Array;
  const parent = Int32Array.from({ length: geo.getAttribute('position').count }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let t = 0; t < idx.length; t += 3) {
    union(idx[t], idx[t + 1]);
    union(idx[t], idx[t + 2]);
  }
  const cardOf = new Map<number, number>();
  const cards: number[][] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const root = find(idx[t]);
    let c = cardOf.get(root);
    if (c === undefined) {
      c = cards.length;
      cardOf.set(root, c);
      cards.push([]);
    }
    cards[c].push(t);
  }
  let seed = 20261030;
  const rnd = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const src = idx.slice();
  let o = 0;
  for (const card of cards) {
    for (const t of card) {
      idx[o++] = src[t];
      idx[o++] = src[t + 1];
      idx[o++] = src[t + 2];
    }
  }
  index.needsUpdate = true;
  return cards.length;
}

export class BarsAvatar {
  private renderer?: THREE.WebGLRenderer;
  /** Post chain: render → ground-truth ambient occlusion (contact shadows between head, body and paws) → output. */
  private composer?: EffectComposer;
  private gtao?: GTAOPass;
  private aoBlend = 0.6;
  /** Screen-space AO on/off (?ao=0). */
  ao = true;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  private model?: THREE.Object3D;
  private meshes: THREE.Mesh[] = [];
  private morph: Record<string, number> = {};
  private bones: Record<string, BoneRig> = {};
  private source: FrameSource | null = null;
  private raf = 0;
  private last = 0;
  private resizeObserver?: ResizeObserver;
  private bounds = new THREE.Box3();
  private loadedUrl: string | null = null;

  // animation state
  private jaw = new Spring(22);
  private wide = new Spring(20);
  private round = new Spring(20);
  private energy = new Spring(4);
  private headPitch = new Spring(4.5);
  private headYaw = new Spring(3);
  private headRoll = new Spring(3.5);
  private mouthO = new Spring(16);
  private mouthOBig = new Spring(12);
  private laugh = new Spring(10);
  /** The art's smile and frown lines, drawn by the shader (build extras 'mouth_lines'). */
  private lines = lineUniforms();
  /** The model's mouth is painted by the shader (generated models), not cut open. */
  private paintedMouth = false;
  /** Face drawn from the concept art (generated model with the art projected on it). */
  private artFace: ArtFace | null = null;
  /** Current emotion name (for the art face). */
  emotionName: (() => Emotion) | null = null;
  /** Debug: hold a blink (?blink=1). */
  forceBlink = 0;
  /** Brightness of the unlit art eyes relative to the lit fur (?arteye=1.2). */
  artExposure = 1.2;
  /** The model has real eyeballs and lids on bones (build.py); the browser only poses them. */
  private eyes3d = false;
  /** The lids are shape keys of the face (lidUp/lidLo/lidHappy/lidTilt/lidWide.L/R) rather than lid bones. */
  private lidMorphs = false;
  /** Gaze angles were tuned on a 7 cm eyeball; a bigger one turns less for the same look. */
  private gazeK = 1;
  private readonly lidArch = { L: new Spring(14), R: new Spring(14) };
  /** The eyes' highlight discs, per side: hidden while the lids are mostly shut (a lid slides close over them). */
  private glints: Record<'L' | 'R', THREE.Object3D[]> = { L: [], R: [] };
  /** The eyeballs' materials, per side: they dim as the lids shut (no sclera glinting through where the rims meet). */
  private eyeMats: Partial<Record<'L' | 'R', THREE.MeshStandardMaterial>> = {};
  private lidOpen: [number, number] = [45, 45];
  private lidBakedTilt = 0;
  private blinkStart = -1;
  private blinkClose = 0.14;
  private blinkOpen = 0.27;
  private breathPhase = 0;
  private warm = 0;
  private blinkNext3d = 2.5;
  private readonly lidUp = { L: new Spring(16), R: new Spring(16) };
  private readonly lidLo = { L: new Spring(16), R: new Spring(16) };
  private readonly lidTilt = { L: new Spring(10), R: new Spring(10) };
  private readonly gazeX = new Spring(26);
  private readonly gazeY = new Spring(26);
  private saccNext = 1;
  private saccX = 0;
  private saccY = 0;
  /** The current gaze (deg): the head follows it a little, late. */
  private gazeForHead: [number, number] = [0, 0];
  private paintOpen = new Spring(26);
  private paintRound = new Spring(18);
  private smileL = new Spring(5.5);
  private smileR = new Spring(5.5);
  private frown = new Spring(5.5);
  private eyes: EyeUniforms | null = null;
  private eyeL = eyeDefaults();
  private eyeR = eyeDefaults();
  private blinkAt = -1;
  private blinkNext = 2;
  /** Emotion source (see emotions.ts); null = always the resting face. */
  expression: (() => Expression) | null = null;
  /** Shell fur (shells = 0 turns it off). */
  fur: FurOptions = { ...FUR_DEFAULTS };
  /** 1 = closed eyes when calm (the sculpt's own look); the concept art has them open, so 0 by default. */
  restEyesClosed = 0;
  private earL = { fold: new Spring(12), flick: new Spring(16), until: 0, next: 3 };
  private earR = { fold: new Spring(12), flick: new Spring(16), until: 0, next: 5 };
  private tailFlick = new Spring(6);
  /** The body's slow sway and the head's micro-motion: layered noise (a studio idle is never a single sine). */
  private readonly sway = new Spring(2);
  private tailFlickUntil = 0;
  private tailNext = 6;
  private nodUntil = 0;
  private nodNext = 0;
  private wasSpeaking = false;
  private time = 0;
  private frames = 0;
  private fpsAt = performance.now();
  fps = 0;
  /** Current QUALITY step: frames slower than SLOW_FRAME_MS step it down (see judgeFrame); ?barsq=N pins a step. */
  quality = 0;
  private autoQuality = true;
  private qualityAt = 0;     // frames are not judged before this time (a load or a step settling)
  private frameCount = 0;
  private frameSum = 0;
  private slowBefore = 0;    // mean frame before the last step, to check it helped (0 = nothing to check)
  private gpu = '';
  private keyLight?: THREE.DirectionalLight;
  private shadowsOn = true;  // (?barsshadow=0)
  private furMesh?: THREE.Mesh;
  private furCards = 0;      // cards found by shuffleCards (0 = not shuffled yet: only needed below fur 1)
  private hud?: HTMLDivElement;   // ?barsfps: frame rate, step, render size and GPU over the stage
  /** Jaw multiplier (tuning knob). */
  jawGain = 1;
  /** Demo: synthetic speech (visemes cycling, no audio) to check the mouth without a conversation. */
  demo = false;
  /** Debug: fixed morph values (e.g. { jawOpen: 1 }) applied after the animation. */
  pose: Record<string, number> = {};
  /** Debug: fixed bone rotations, degrees about the world x, y, z (x right, y up, z to the viewer) on top of the
   * rest pose, replacing the animation's (?barsbone=arm.L:0,0,-8|paw.R:0,0,10). */
  bonePose: Record<string, [number, number, number]> = {};
  /** Limbs (see updateLimbs): smoothed channels, degrees. */
  private readonly limbS = {
    liftL: new Spring(7), liftR: new Spring(7), fwdL: new Spring(7), fwdR: new Spring(7),
    pitchL: new Spring(7), pitchR: new Spring(7),
    pawL: new Spring(11), pawR: new Spring(11), curlL: new Spring(11), curlR: new Spring(11),
    footL: new Spring(9), footR: new Spring(9), spinL: new Spring(9), spinR: new Spring(9),
    tailUp: new Spring(4), tailWag: new Spring(5),
  };
  private waveAt = -100;
  private waveSide = 0;
  private lastSpeechAt = -100;
  private gestureSide = 0;
  private fidgetAt = -100;
  private fidgetNext = 7;
  private fidgetSide = 0;
  private wiggleAt = -100;
  private wiggleNext = 11;
  framing: BarsFraming = { fill: 0.8, centerY: 0.5, pitch: 6 };

  constructor(private readonly container: HTMLElement) {}

  /** Debug snapshot: the viseme frame and the mouth morphs. */
  probe(): unknown {
    const f = this.source?.getFrame();
    const top = f ? Object.entries(f.visemes).sort((a, b) => b[1] - a[1]).slice(0, 3) : null;
    const u = this.artFace?.uniforms;
    return { hasSource: !!this.source, mode: f?.mode, top, jaw: +this.jaw.value.toFixed(3), emotion: this.emotionName?.(),
      eyeW: u?.uArtEyeW.value, mouthW: u?.uArtMouthW.value, blink: u?.uArtBlink.value };
  }

  get loaded(): string | null {
    return this.loadedUrl;
  }

  async start(url: string, visemeSource: TalkingAvatar, envUrl: string): Promise<void> {
    this.source = frameSource(visemeSource);
    if (!this.renderer) this.initRenderer();
    if (this.loadedUrl !== url) {
      await Promise.all([this.loadModel(url), this.loadEnvironment(envUrl)]);
      this.loadedUrl = url;
      this.warm = 0;
    }
    this.resize();
    if (!this.raf) {
      this.last = performance.now();
      this.qualityAt = this.last + 3000;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** Stops rendering (the engine is hidden); start() resumes. */
  pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private initRenderer(): void {
    // Opaque canvas: the fur shells write alpha < 1 (alpha-to-coverage), which a transparent canvas would blend
    // with the page behind it (washed-out, dusty fur). The studio backdrop is drawn in the scene instead.
    this.gpu = gpuName();
    const weak = WEAK_GPU.test(this.gpu);
    console.info(`[bars] GPU: ${this.gpu || '?'}${weak ? ` - weak: quality ${WEAK_START}, no MSAA` : ''}`);
    // (MSAA cannot be switched off later, and a weak GPU's memory bandwidth is the scarcest thing it has)
    const r = new THREE.WebGLRenderer({ antialias: !weak, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;   // keeps the warm beige of the reference
    r.toneMappingExposure = 1.0;
    this.shadowsOn = new URLSearchParams(location.search).get('barsshadow') !== '0';
    r.shadowMap.enabled = this.shadowsOn;
    r.shadowMap.type = THREE.VSMShadowMap;   // soft shadows, incl. the head onto the chest
    this.scene.background = backdropTexture();
    this.container.appendChild(r.domElement);
    this.renderer = r;

    // No rim lights (they outline the silhouette in white).
    // ?barslight=key,keyX,keyY,keyZ,ambient,ground,shadow,ao,exposure overrides (for matching the art's light)
    const L = (new URLSearchParams(location.search).get('barslight') ?? '').split(',');
    const lp = (i: number, d: number): number => {
      const v = (L[i] ?? '').trim();
      return v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
    };
    // matched to the art by avatar-bars/art_light_cmp.py (luminance percentiles and a grid over the silhouette): a key
    // from the front-left, a little above, carrying the form; the sky/ground fill lifts the shadows without flattening
    const key = new THREE.DirectionalLight(0xffffff, lp(0, 1.7));
    key.position.set(lp(1, -1.0), lp(2, 1.4), lp(3, 2.6));
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 14;
    key.shadow.intensity = lp(6, 0.3);    // the art's cast shadows are soft (the head onto the chest)
    key.shadow.blurSamples = 20;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.015;
    const sc = key.shadow.camera;
    sc.left = -0.8;
    sc.right = 0.8;
    sc.top = 1.2;
    sc.bottom = -0.4;
    sc.near = 0.5;
    sc.far = 6;
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);   // (stronger, it rimmed every right-hand edge)
    fill.position.set(2.0, 0.8, 2.4);
    const back = new THREE.DirectionalLight(0xffffff, 0.45);
    back.position.set(0.4, 1.8, -2.4);
    // a touch cool (the art's shadows are greyish); the ground nearly as bright as the sky: the art's light is flat,
    // the chin's underside and the arms' undersides must not go dark
    const ambient = new THREE.HemisphereLight(0xf6f2e8, 0xece8e2, lp(4, 1.15));   // (warm: the art's cream, not a grey-blue cast)
    ambient.groundColor.multiplyScalar(lp(5, 0.9));
    r.toneMappingExposure = lp(8, 1.17);
    this.aoBlend = lp(7, 0.6);
    this.scene.add(key, key.target, fill, back, ambient);

    // Ground: only the shadow shows (transparent plane), plus a soft contact shadow under the body.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0.02, 0.001, 0);
    this.scene.add(blob);
    // The floor hides what is under it: the conform to the art bent the sculpt's flat base and took the feet up to
    // 3 cm below the floor, which the transparent ground showed through, darkened by the contact shadow - a band
    // under the soles, cut by the floor line. A depth-only plane drawn first; it takes part in the occlusion pass
    // too (the pass would otherwise shade the hidden feet onto the floor), which gives the contact its soft shadow.
    const floorMask = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ colorWrite: false }));
    floorMask.rotation.x = -Math.PI / 2;
    floorMask.renderOrder = -1;
    this.scene.add(floorMask);

    if (this.ao) {
      const composer = new EffectComposer(r);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = this.aoBlend;
      // (a thinner, shorter reach than the default: the pass sees the body without the fur, and round every limb's
      // silhouette over the body it darkened the fringe of cards into a dark dotted outline)
      gtao.updateGtaoMaterial({ radius: 0.07, distanceExponent: 1.5, thickness: 0.35, scale: 1.2, samples: 16, distanceFallOff: 1 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
      // The fur shells must not take part in the occlusion pass: every strand would cast a speckle of shadow.
      const gtaoRender = gtao.render.bind(gtao);
      gtao.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
        const hidden: THREE.Object3D[] = [];
        this.scene.traverse((o) => {
          if ((/_fur|Glint|Shade/.test(o.name) || o.userData.noAO) && o.visible) {
            o.visible = false;
            hidden.push(o);
          }
        });
        gtaoRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        for (const o of hidden) o.visible = true;
      };
      composer.addPass(gtao);
      composer.addPass(new OutputPass());
      composer.addPass(new SMAAPass());   // (the composer's targets carry no MSAA: alpha-tested fur edges crawled)
      this.composer = composer;
      this.gtao = gtao;
    }
    const params = new URLSearchParams(location.search);
    const pinned = Number(params.get('barsq') ?? NaN);
    if (QUALITY[pinned]) {
      this.autoQuality = false;
      this.setQuality(pinned);
    } else if (weak) {
      this.setQuality(WEAK_START);
    }
    if (params.has('barsfps')) {
      this.hud = document.createElement('div');
      this.hud.style.cssText = 'position:absolute;left:8px;top:8px;z-index:5;padding:2px 6px;border-radius:4px;'
        + 'background:rgba(0,0,0,.6);color:#fff;font:12px/1.4 monospace;pointer-events:none';
      this.container.append(this.hud);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  private async loadEnvironment(url: string): Promise<void> {
    if (!this.renderer || this.scene.environment) return;
    try {
      const hdr = await new RGBELoader().loadAsync(url);
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environmentIntensity = 0.35;
      hdr.dispose();
      pmrem.dispose();
    } catch {
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.8));
    }
  }

  private async loadModel(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.model) this.scene.remove(this.model);
    const model = gltf.scene;
    this.meshes = [];
    // a generated model with the art projected on it: its face comes from the art images (bars-artface.ts)
    let artMap: number[] | undefined;
    let nose: number[] | undefined;
    let artMouths = true;
    let artTint = [1, 1, 1];
    model.traverse((o) => {
      const u = o.userData as {
        art?: number[]; art_mouths?: number; art_tint?: number[]; nose?: number[]; eyes3d?: number; lid_open?: unknown;
        lid_tilt?: number; lid_morphs?: number; gaze_k?: number; mouth_lines?: number[]; mouth_cut?: number[];
      };
      if (u.mouth_lines) setMouthLines(this.lines, u.mouth_lines);
      if (u.mouth_cut) setMouthCut(this.lines, u.mouth_cut);
      if (typeof u.lid_tilt === 'number') this.lidBakedTilt = u.lid_tilt;
      if (u.lid_morphs) this.lidMorphs = true;
      if (typeof u.gaze_k === 'number') this.gazeK = u.gaze_k;
      if (u.eyes3d) {
        this.eyes3d = true;
        const lo = u.lid_open as number | number[] | undefined;
        if (Array.isArray(lo)) this.lidOpen = [lo[0], lo[1]];
        else if (typeof lo === 'number') this.lidOpen = [lo, lo];
      }
      if (u.art) artMap = u.art;
      if (u.nose) nose = u.nose;
      if (u.art_mouths !== undefined) artMouths = u.art_mouths !== 0;
      if (u.art_tint) artTint = u.art_tint;
    });
    this.artFace = artMap && !this.eyes3d ? await ArtFace.load('/bars2d', artMap, artMouths, artTint) : null;
    const bodies: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned + morphed: the bind-pose bounds are not reliable
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (src.name === 'Fur') {
        // hair cards (build.py): the exported material (vertex colours = the coat under each card, tapered card
        // alpha), alpha-tested so 36k cards need no sorting. A card's normal is the skin's under it, whichever
        // side faces the camera: the double-sided flip would turn every card seen from behind into a dark scribble.
        src.side = THREE.DoubleSide;
        src.alphaTest = 0.4;
        src.transparent = false;
        src.depthWrite = true;
        src.roughness = 1;
        src.envMapIntensity = 0.45;
        src.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <normal_fragment_begin>',
              THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')
                // a card on the silhouette carries a grazing normal and went dark against the lit body behind it (a
                // dotted outline round every limb); hairs scatter light, so lean the normal towards the viewer -
                // halfway only: leant fully (0.8), every card on skin turned from the light (a raised paw's
                // underside, the thighs' sides) came out lighter than the skin under it, a sprinkle of light flakes
                + '\n{ vec3 vd = normalize(vViewPosition); float gr = 1.0 - abs(dot(normal, vd));' +
                ' normal = normalize(normal + 0.45 * gr * gr * vd); nonPerturbedNormal = normal; }',
            )
            // cards right on the silhouette (the skin seen edge-on) fade a little: against the background they
            // escape the occlusion pass; the rest stays — the art's plush has a soft fringe round every limb
            .replace(
              '#include <alphatest_fragment>',
              'diffuseColor.a *= smoothstep(0.02, 0.2, abs(dot(normalize(vNormal), normalize(vViewPosition))));\n' +
                '#include <alphatest_fragment>',
            )
            // the fringe is backlit and translucent, like the art's: brighter where the skin under it turns away
            // (a touch: at 0.15 the same flakes)
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n' +
                'totalEmissiveRadiance += diffuseColor.rgb * 0.06 * pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);',
            );
        };
        src.customProgramCacheKey = () => 'bars-fur-cards';
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.meshes.push(mesh);
        this.furMesh = mesh;
        return;
      }
      if (src.name === 'Glint') {
        // the art's eye highlights (build.py): plain white discs on the head, the eye turns under them
        mesh.material = new THREE.MeshBasicMaterial({ name: 'Glint', color: 0xffffff, toneMapped: false });
        this.glints[/R$/.test(mesh.name) ? 'R' : 'L'].push(mesh);
        mesh.castShadow = mesh.receiveShadow = false;
        this.meshes.push(mesh);
        return;
      }
      if (src.name.startsWith('EyeShade')) {
        // the lids' soft shadow on the eyeball, riding the lid bones
        mesh.material = new THREE.MeshBasicMaterial({ name: src.name, map: src.map ?? null, transparent: true, depthWrite: false });
        mesh.castShadow = mesh.receiveShadow = false;
        mesh.renderOrder = 1;
        this.meshes.push(mesh);
        return;
      }
      if (src.name === 'Eye' || src.name.startsWith('Lid')) {
        // real eyes (build.py): the eyeball moist, not a glass marble; the lids fur with the liner on their edge
        const eye = src.name === 'Eye';
        mesh.material = new THREE.MeshStandardMaterial({
          name: src.name, map: src.map ?? null, roughness: eye ? 0.4 : 0.9, metalness: 0, envMapIntensity: eye ? 0.5 : 0.6,
        });
        mesh.castShadow = false;
        mesh.receiveShadow = !eye;
        if (eye) this.eyeMats[/R$/.test(mesh.name) ? 'R' : 'L'] = mesh.material as THREE.MeshStandardMaterial;
        this.meshes.push(mesh);
        return;
      }
      if (src.name === 'Mouth') {
        const mm = new THREE.MeshStandardMaterial({
          name: 'Mouth', vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.15,
          side: THREE.DoubleSide,   // (a fold in the morphed pocket must not open a window onto its dark back)
          // the pocket's first strips hang off the lips' very edge, at the skin's depth: along the sealed cut they
          // rasterised as a chain of dark dots on the shared edge; nudged back in depth the skin wins there
          polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
        });
        // the tongue reads pink as in the art even in the mouth's shadow: a little self-light on the pink, and no
        // shadow map inside the mouth (the tongue brought out by the laugh self-shadowed in stripes; the inside is
        // dark by its colours anyway)
        mm.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_begin>', '#undef USE_SHADOWMAP\n#include <lights_fragment_begin>')
            // flat, like the art's painted mouth: one normal towards the viewer (the pocket's own normals, pulled
            // about by the morphs, lit the tongue in stripes); the depth shading is in the vertex colours already
            .replace(
              '#include <normal_fragment_begin>',
              '#include <normal_fragment_begin>\nnormal = normalize(vec3(0.0, 0.2, 1.0)); nonPerturbedNormal = normal;',
            )
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * 0.45;',
            );
        };
        mm.customProgramCacheKey = () => 'bars-mouth';
        mesh.material = mm;
        mesh.userData.noAO = true;
        mesh.castShadow = false;
      } else {
        const m = furMaterial(src);
        this.eyes = installEyes(m);
        const eyes = m.onBeforeCompile;
        m.onBeforeCompile = (shader, r) => {
          eyes.call(m, shader, r);
          furRootShading(shader, false);   // silhouette-only shells: the coat's base must not be darkened
          installMouthLines(shader, this.lines);
          const art = this.artFace;
          if (art) {
            Object.assign(shader.uniforms, art.uniforms);
            shader.fragmentShader = shader.fragmentShader
              .replace('void main() {', `${ART_FACE_DECL}
${ART_FACE_FRAG_DECL}
void main() {`)
              .replace('#include <alphamap_fragment>', `${ART_FACE_FRAG}
#include <alphamap_fragment>`);
          }
        };
        m.customProgramCacheKey = () => (this.artFace ? 'bars-eyes-fur-art' : 'bars-eyes-fur');
        mesh.material = m;
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) bodies.push(mesh as THREE.SkinnedMesh);
      }
      this.meshes.push(mesh);
    });
    // a generated model carries its own eye and mouth layout (glTF extras)
    let ex: { eyes?: number[]; mouth?: number[] } = {};
    model.traverse((o) => {
      const u = o.userData as { eyes?: number[]; mouth?: number[] };
      if (u.eyes) ex = { ...ex, eyes: u.eyes };
      if (u.mouth) ex = { ...ex, mouth: u.mouth };
    });
    if (this.eyes && ex.eyes) this.eyes.uEyeGeo.value.set(ex.eyes[0], ex.eyes[1], ex.eyes[2]);
    this.paintedMouth = !!(this.eyes && ex.mouth);
    if (this.eyes && ex.mouth) {
      this.eyes.uMouthP.value.x = ex.mouth[0];
      for (let i = 0; i < 9; i++) this.eyes.uMouthZ.value[i] = ex.mouth[i + 1];
    }
    if (this.eyes && nose && nose.length >= 7) {
      this.eyes.uNose1.value.set(nose[0], nose[1], nose[2], nose[3]);
      this.eyes.uNose2.value.set(nose[4], nose[5], nose[6], 1);
    }
    // real eyes (or the art's) replace the painted ones: else the painted lids' lash flicks stick out past the real
    // eyes' outer corners (brown forks)
    if ((this.artFace || this.eyes3d) && this.eyes) this.eyes.uEyeGeo.value.set(0, -10, 0.001);
    if (this.artFace && this.eyes) {
      if (this.artFace.mouths) {
        this.eyes.uMouthP.value.x = 0;
        this.paintedMouth = false;
      }
    }
    for (const b of bodies) growFur(b, this.fur, this.eyes, this.artFace?.uniforms ?? null);
    this.addWhiskers(model);
    const dict = this.meshes[0]?.morphTargetDictionary ?? {};
    this.morph = { ...dict };
    // Bones (the loader strips '.' from node names: ear.L → earL).
    const find = (name: string): THREE.Bone | undefined =>
      (model.getObjectByName(name) ?? model.getObjectByName(name.replace('.', ''))) as THREE.Bone | undefined;
    model.updateMatrixWorld(true);
    this.bones = {};
    for (const name of ['body', 'head', 'ear.L', 'ear.R', 'tail', 'eye.L', 'eye.R', 'lidU.L', 'lidL.L', 'lidU.R', 'lidL.R',
      'arm.L', 'arm.R', 'paw.L', 'paw.R', 'foot.L', 'foot.R']) {
      const bone = find(name);
      if (!bone) continue;
      const parentQ = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentQ);
      const inv = parentQ.invert();
      this.bones[name] = {
        bone,
        rest: bone.quaternion.clone(),
        axes: {
          x: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
          y: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
          z: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
        },
      };
    }
    this.scene.add(model);
    this.model = model;
    this.bounds.setFromObject(model);
    this.applyFur();   // (a weak GPU starts below the full coat)
  }

  /** Long hair-thin whiskers like the concept art (the sculpted ones are collapsed by the build). */
  private addWhiskers(model: THREE.Object3D): void {
    const head = (model.getObjectByName('head') as THREE.Bone | undefined) ?? null;
    if (!head) return;
    model.updateMatrixWorld(true);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.8 });
    // roots on the whisker pads from the build (glTF extras, rest pose: x right, y up, z front), 4 per side
    let flat: number[] | undefined;
    model.traverse((o) => {
      const w = (o.userData as { whiskers?: number[] }).whiskers;
      if (w && !flat) flat = w;
    });
    if (!flat || flat.length < 24) return;
    const roots = flat;
    for (const side of [-1, 1]) {
      [0.16, 0.06, -0.05, -0.16].forEach((rise, i) => {
        const k = ((side < 0 ? 0 : 4) + i) * 3;
        const root = new THREE.Vector3(roots[k], roots[k + 1], roots[k + 2]);
        const dir = new THREE.Vector3(side, rise, 0.18).normalize();
        const len = 0.19 - Math.abs(i - 1.5) * 0.02;
        const pts = [0, 0.33, 0.66, 1].map((t) =>
          root.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -0.05 * t * t, -0.025 * t * t)));
        // tapering: thick at the root, hair-thin at the tip
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0008, 6, false);
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        const curve = new THREE.CatmullRomCurve3(pts);
        for (let k = 0; k < pos.count; k++) {
          const seg = Math.floor(k / 7) / 24;
          const c = curve.getPoint(Math.min(1, seg));
          const v = new THREE.Vector3().fromBufferAttribute(pos, k);
          v.sub(c).multiplyScalar(1 - 0.75 * seg).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = false;
        model.add(m);
        head.attach(m); // keeps the rest-pose placement, then follows the head
      });
    }
  }

  /** Places the camera so the figure fills `fill` of the view height. */
  private frameCamera(): void {
    const box = this.bounds;
    if (box.isEmpty()) return;
    const f = this.framing;
    const center = box.getCenter(new THREE.Vector3());
    const height = box.max.y - box.min.y;
    const cam = this.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const fitH = height / f.fill;
    // Whole figure on screen: also fit the width (narrow portrait screens). Zoomed-in framings (fill > 1) skip it.
    const fitW = f.fill > 1 ? 0 : (box.max.x - box.min.x) / Math.max(0.3, Math.min(cam.aspect, 3)) / 0.9;
    // Distance to the front of the figure (the paws stick out towards the camera), not to its centre.
    const dist = Math.max(fitH, fitW) / (2 * Math.tan(vfov / 2)) + (box.max.z - box.min.z) * 0.35;
    const visible = 2 * dist * Math.tan(vfov / 2);
    const look = center.clone();
    look.y += (f.centerY - 0.5) * visible;
    const pitch = THREE.MathUtils.degToRad(f.pitch);
    const yaw = THREE.MathUtils.degToRad(f.yaw ?? 0);
    const flat = Math.cos(pitch) * dist;
    cam.position.set(look.x + Math.sin(yaw) * flat, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * flat);
    cam.lookAt(look);
  }

  private setQuality(step: number): void {
    this.quality = step;
    const q = QUALITY[step];
    const ratio = Math.max(0.4, Math.min(window.devicePixelRatio, 2) * q.scale);
    this.renderer?.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
    this.setShadow(q.shadow, q.blur);
    this.applyFur();
    this.resize();
  }

  /** The key light's soft shadow: map size and blur samples; 0 stops casting (the materials recompile once). */
  private setShadow(size: number, blur: number): void {
    const key = this.keyLight;
    if (!key) return;
    key.castShadow = size > 0 && this.shadowsOn;
    key.shadow.blurSamples = blur;
    if (size > 0 && key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;   // (rebuilt at the new size on the next frame)
      key.shadow.mapPass?.dispose();
      key.shadow.mapPass = null;   // (the VSM blur's target)
    }
  }

  /** Draws QUALITY[].fur of the fur cards (shuffled once, the first time fewer than all are drawn). */
  private applyFur(): void {
    const geo = this.furMesh?.geometry;
    if (!geo?.index) return;
    const share = QUALITY[this.quality].fur;
    if (share < 1 && !this.furCards) {
      const t = performance.now();
      this.furCards = shuffleCards(geo);
      console.info(`[bars] fur: ${this.furCards} cards shuffled in ${(performance.now() - t).toFixed(0)} ms`);
    }
    geo.setDrawRange(0, share >= 1 ? Infinity : Math.floor((geo.index.count * share) / 3) * 3);
  }

  /**
   * Auto quality: the mean frame over ~2 s windows; a slow one steps the quality down. When a step did not make the
   * frame faster (a 30 Hz screen or a slow CPU, not the GPU) the adaptation stops there. Never steps up: frames
   * capped by the screen's refresh show no headroom.
   */
  private judgeFrame(ms: number): void {
    const now = performance.now();
    if (!this.autoQuality || document.hidden || now < this.qualityAt || ms > 250) return;  // (a hitch, a hidden tab)
    this.frameCount++;
    this.frameSum += ms;
    if (this.frameSum < 2000 || this.frameCount < 20) return;
    const mean = this.frameSum / this.frameCount;
    this.frameCount = this.frameSum = 0;
    const cap = QUALITY[this.quality].fps;
    const slow = cap ? 1250 / cap : SLOW_FRAME_MS;   // (capped: under 80 % of the cap)
    if (this.slowBefore) {
      const before = this.slowBefore;
      this.slowBefore = 0;
      // (no step back: a weak GPU bound by geometry gains little from the first, resolution-only steps, and taking
      // them back kept the kiosk's HD 4600 at the top)
      if (mean > before * 0.88 && mean > slow) {
        this.autoQuality = false;
        console.info(`[bars] quality step did not help (${before.toFixed(1)} -> ${mean.toFixed(1)} ms/frame): stays at ${this.quality}, auto off`);
        return;
      }
    }
    if (mean > slow && this.quality < QUALITY.length - 1) {
      this.slowBefore = mean;
      this.setQuality(this.quality + 1);
      this.qualityAt = now + 1500;   // (new buffers; dropping the shadow recompiles every material)
      const q = QUALITY[this.quality];
      console.info(`[bars] ${mean.toFixed(1)} ms/frame: quality ${this.quality} (resolution x${q.scale}, AO ${q.ao ? 'on' : 'off'}, `
        + `shadow ${q.shadow || 'off'}, fur ${q.fur * 100}%, ${q.fps ? `${q.fps} fps` : 'full rate'})`);
    }
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frameCamera();
  }

  private setMorph(name: string, v: number): void {
    const i = this.morph[name];
    if (i === undefined) return;
    for (const m of this.meshes) if (m.morphTargetInfluences) m.morphTargetInfluences[i] = v;
  }

  private rotate(name: string, x: number, y: number, z: number): void {
    const b = this.bones[name];
    if (!b) return;
    const q = new THREE.Quaternion()
      .setFromAxisAngle(b.axes.y, y)
      .multiply(new THREE.Quaternion().setFromAxisAngle(b.axes.x, x))
      .multiply(new THREE.Quaternion().setFromAxisAngle(b.axes.z, z));
    b.bone.quaternion.copy(q.multiply(b.rest));
  }

  /** Lid pose: pitch about the lid's own (tilted) horizontal axis, plus an expression tilt about the gaze axis. */
  private poseLid(name: string, pitch: number, tilt: number, bakedTilt: number): void {
    const b = this.bones[name];
    if (!b) return;
    const qz = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(b.axes.z, a);
    const q = qz(tilt + bakedTilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(b.axes.x, pitch))
      .multiply(qz(-bakedTilt));
    b.bone.quaternion.copy(q.multiply(b.rest));
  }

  private readonly tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const now0 = performance.now();
    const cap = QUALITY[this.quality].fps;
    if (cap && now0 - this.last < 1000 / cap - 4) return;   // (a weak GPU draws every other frame of a 60 Hz screen)
    // the first frames after a load run with a long step: every spring lands on its target at once, instead of the
    // face settling (lids closing, the smile arriving) in front of the viewer
    const step = now0 - this.last;
    const dt = this.warm++ < 4 ? 1 : Math.min(0.05, step / 1000);
    this.last = now0;
    this.time += dt;
    this.animate(dt);
    for (const [k, v] of Object.entries(this.pose)) this.setMorph(k, v);
    for (const [k, [x, y, z]] of Object.entries(this.bonePose)) this.rotate(k, x * DEG, y * DEG, z * DEG);
    // (without the AO pass: straight to the screen, which has MSAA, so no SMAA either)
    if (this.composer && QUALITY[this.quality].ao) this.composer.render();
    else this.renderer?.render(this.scene, this.camera);
    this.judgeFrame(step);
    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
      if (this.hud) {
        const c = this.renderer?.domElement;
        this.hud.textContent = `${this.fps} fps · q${this.quality}${this.autoQuality ? '' : ' fixed'} · `
          + `${c?.width}×${c?.height} · ${this.gpu.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 60)}`;
      }
    }
  };

  private animate(dt: number): void {
    const t = this.time;
    const frame = this.demo ? demoFrame(t) : this.source?.getFrame();
    const mode: Mode = frame?.mode ?? 'listening';
    const speaking = mode === 'speaking';
    const ex = this.expression?.() ?? null;
    const f = ex?.face ?? {};
    const g = (n: string): number => f[n] ?? 0;

    // --- mouth from visemes
    let jaw = 0;
    let wide = 0;
    let round = 0;
    if (frame) {
      for (const [name, w] of Object.entries(frame.visemes)) {
        const s = VISEMES[name.startsWith('viseme_') ? name : `viseme_${name}`]; // the SDK reports 'aa', 'PP', …
        if (!s || !(w > 0)) continue;
        jaw += s[0] * w;
        wide += s[1] * w;
        round += s[2] * w;
      }
    }
    // Ease-out curve: a small cat mouth needs mid visemes to read clearly.
    jaw = 1 - Math.pow(1 - Math.min(1, jaw * this.jawGain), 1.8);
    // The expression's own mouth (laughing, "o!") — while speaking only as a floor, so the words still articulate.
    const exJaw = Math.min(1, g('jawOpen') + g('tongueOut') * 0.3);
    // "o!" / surprise: a small round mouth in the middle (mouthO) instead of the wide jaw
    const exO = Math.max(g('mouthFunnel'), g('mouthPucker'));
    const exRound = 0;
    const exWide = (g('mouthStretchLeft') + g('mouthStretchRight')) / 2;
    wide = speaking ? Math.max(wide * 0.6, exWide * 0.5) : Math.max(wide, exWide);
    const speechRound = round;
    // an 'o' is the small round mouth alone (a dropped jaw opens it wide); gated at once - with jaw * (1 - o) both
    // ramping in together opened the wide jaw for a moment at the start of every surprise: a 'w' before the 'o'
    const exWideJaw = exJaw * Math.max(0, 1 - 10 * exO);
    // round visemes (O, U, RR, CH) are the art's small 'o' (mouthO) with the jaw mostly held: a wide jaw pinched by
    // mouthRound made a teardrop with a pointed bottom; and the expression's own 'o' stays out of speech (on top of
    // the jaw it made the same point)
    jaw = speaking ? Math.max(jaw * Math.max(0, 1 - 1.6 * speechRound), exWideJaw * 0.45) : Math.max(jaw, exWideJaw);
    const o = speaking ? speechRound * 0.8 : Math.max(exO * Math.min(1, 0.55 + exJaw * 0.75), 0);
    const mo = Math.max(0, this.mouthO.step(Math.min(1, o), dt));
    // a big surprise (the expression's jaw past 0.45) is the art's bigger oval: mouthOBig takes over from mouthO
    const big = speaking ? 0 : Math.min(1, Math.max(0, (exJaw - 0.42) / 0.16));
    // (the big 'o' grows out of the small one: from the first frame its wide opening parted the sealed cut beyond
    // the little 'ω' as thin whiskers from the corners)
    const mb = this.mouthOBig.step(big, dt) * Math.min(1, Math.max(0, (mo - 0.2) / 0.5));
    this.setMorph('mouthO', mo * (1 - mb));
    this.setMorph('mouthOBig', mo * mb);
    round = speaking ? exRound * 0.5 : Math.max(round, exRound);   // (the round visemes go through mouthO above)
    const j = this.jaw.step(jaw, dt);
    // a laugh (the expression's jaw open with a smile) is the art's wide 'D' with the tongue: mouthLaugh takes over
    // from the plain jaw (while speaking only a little, so the words still articulate)
    const exSmile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2;
    // (gated by the 'o' at once: the calm face's smile fading out under a rising surprise let a little laugh in)
    let laughW = Math.min(1, Math.max(0, (exJaw - 0.3) / 0.45)) * Math.min(1, exSmile / 0.6) * Math.max(0, 1 - 5 * exO);
    if (speaking) laughW *= 0.35;
    const lw = this.laugh.step(laughW, dt);
    // rest -> mouthLaugh1 -> mouthLaugh2 -> mouthLaugh, piecewise: the 'D' grows out of the middle (part of
    // mouthLaugh alone opened the whole cut a little - a thin 'moustache' with wings, on the way in and out)
    const ls = Math.min(3, Math.max(0, lw * 3));
    const tri = (c: number): number => Math.max(0, 1 - Math.abs(ls - c));
    // (the first stretch eased out: half-way to mouthLaugh1 the little 'ω' was a half-flattened gull)
    this.setMorph('mouthLaugh1', ls < 1 ? 1 - (1 - ls) * (1 - ls) : tri(1));
    this.setMorph('mouthLaugh2', tri(2));
    this.setMorph('mouthLaugh', Math.max(0, ls - 2));
    const jw = Math.max(0, j) * (1 - lw);
    this.setMorph('jawOpen', jw);
    // the upper lip in two stages ahead of the jaw: the little 'ω' flattens within the first quarter of the jaw's
    // travel, then arches - an oval opening from the first, never a 'w' (the half-lifted notch)
    // (from a little past zero: a round viseme holds the jaw near 0.15 and opens through mouthO, whose narrow lower
    // lip under a full-width lifted upper lip made a drop with a pointed bottom)
    // The lips' little 'ω' straightened ONCE: every opening carries that straightening (the jaw's and the 'o's in
    // their first-stage keys, the laugh's in its shapes), each ahead of its own opening; two of them on at once
    // straightened it twice - the cusp sank under the lower lip as a 'V' bottom (an 'o' viseme over the jaw) and the
    // upper lip's lobes rose over the cusp as an 'm' (the jaw under the laugh's start). The laugh's shapes take
    // their share first, the jaw and the 'o' split what is left by their own demands.
    const laughFlat = ls < 1 ? 1 - (1 - ls) * (1 - ls) : 1;
    const fj = Math.min(1, Math.max(0, jw - 0.02) * 10);
    const fo = Math.min(1, 5 * Math.max(0, mo));
    const fAll = Math.max(fj, fo) * (1 - laughFlat);
    const fSum = fj + fo;
    const fJaw = fSum > 1e-6 ? fAll * fj / fSum : 0;
    const fO = fSum > 1e-6 ? fAll * fo / fSum : 0;
    this.setMorph('jawOpenFlat', fJaw);
    // (the big 'o's straightening reaches past the little 'ω' into the sealed cut: at the surprise's start, before
    // its opening, it parted the cut as thin dark whiskers from the corners - the small 'o's narrow one leads)
    this.setMorph('mouthOFlat', fO * (1 - mb));
    this.setMorph('mouthOBigFlat', fO * mb);
    this.setMorph('jawOpenUp', Math.min(1, Math.max(0, jw - 0.08) * 1.6));
    // the art's dark lip line round an open mouth, as far as each opening reaches
    this.lines.uCutW.value.set(Math.min(1, jw * 1.6), lw, mo * (1 - mb), mo * mb);
    const L = this.lines;
    // the big 'o's lip line only as far as it has opened (growing out of the small 'o's: drawn at its full 40 mm
    // from the start, it ran along the still sealed cut as dark whiskers from the corners)
    if (L.cutHW[3] > 0) L.uCutHW.value.w = L.cutHW[2] + (L.cutHW[3] - L.cutHW[2]) * Math.min(1, mo * mb * 1.4);
    if (L.laughHW > 0) {
      // the laugh's lip line as far as the current shape opens
      const [h1, h2] = L.laughSteps;
      L.uCutHW.value.y = L.laughHW * (ls < 1 ? h1 : ls < 2 ? h1 + (h2 - h1) * (ls - 1) : h2 + (1 - h2) * (ls - 2));
    }
    this.setMorph('mouthWide', Math.max(0, this.wide.step(Math.min(1, wide), dt)));
    this.setMorph('mouthRound', Math.max(0, this.round.step(Math.min(1, round), dt)));
    const e = this.energy.step(speaking ? j : 0, dt);
    if (this.artFace) {
      if (this.artFace.mouths) {
        // the art's mouths do the talking; no chin drop (it would stretch the drawing)
        this.setMorph('jawOpen', 0);
        this.setMorph('jawOpenFlat', 0);
        this.setMorph('jawOpenUp', 0);
        this.setMorph('mouthO', 0);
      }
      this.artFace.forceBlink = this.forceBlink;
      (this.artFace.uniforms.uArtExposure as { value: number }).value = this.artExposure;
      this.artFace.update(dt, this.emotionName?.() ?? 'calm', Math.max(0, j), Math.max(0, this.round.value), speaking);
    }
    if (this.paintedMouth && this.eyes) {
      // the painted opening: speech, or the expression's own mouth (small 'o' for wow, big one for surprise)
      const open = this.paintOpen.step(Math.min(1, Math.max(Math.max(0, j), mo * 0.6, g('jawOpen') * 1.4)), dt);
      this.eyes.uMouthP.value.y = Math.max(0, open);
      this.eyes.uMouthP.value.z = this.paintRound.step(Math.min(1, Math.max(this.round.value, exO)), dt);
      this.eyes.uMouthP.value.w = Math.max(0, this.wide.value, exWide);
    }

    // --- smile / frown from the expression (a touch more smile while speaking)
    const lift = speaking ? 0.12 : 0;
    // the smile morph brings the sculpt's whole smiling muzzle back: a soft smile (calm 0.3) barely, a real one fully
    const sm = (v: number): number => Math.pow(Math.min(1, v), 2.2);
    // (the laugh's open mouth takes the pads' place: the smile keys step back, the laugh key keeps the cheeks)
    const lwS = 1 - 0.85 * Math.min(1, 2 * lw);
    const smL = this.smileL.step(sm(g('mouthSmileLeft') + lift), dt) * lwS;
    const smR = this.smileR.step(sm(g('mouthSmileRight') + lift), dt) * lwS;
    this.setMorph('smileL', smL);
    this.setMorph('smileR', smR);
    const fr = this.frown.step((g('mouthFrownLeft') + g('mouthFrownRight')) / 2, dt);
    this.setMorph('mouthFrown', fr);
    // the art's smile and frown lines, as dark as the keys are deep (ARKit Left = +x); they are closed-mouth lines:
    // under an open mouth (speech, the laugh, an 'o') they fade, or they read as a second mouth on the chin
    // (by the smoothed speech energy too: with the jaw alone the line popped back in every pause between words)
    const closed = 1 - Math.min(1, Math.max(jw * 2.5, e * 3) + lw + mo);
    // only a real smile draws the line: the calm face's slight one (and the lift while speaking) left a faint
    // scratch on each cheek, where the art's calm faces have none
    const lineK = (v: number): number => {
      const x = Math.min(1, Math.max(0, (v - 0.08) / 0.22));
      return v * x * x * (3 - 2 * x);
    };
    this.lines.uLineS.value.y = lineK(smL) * closed;
    this.lines.uLineS.value.w = lineK(smR) * closed;
    this.lines.uLineF.value.y = this.lines.uLineF.value.w = lineK(fr) * closed;

    // --- eyes
    if (this.eyes3d) this.updateEyes3d(t, dt, f);
    else this.updateEyes(t, dt, f, ex?.rest ?? 1);

    // --- breathing: a quicker inhale and a slower exhale (not a sine), the rate wandering a little; faster and
    // shallower while speaking
    const breathRate = (speaking ? 0.42 : 0.26) * (1 + 0.08 * noise(t * 0.1, 31));
    this.breathPhase = (this.breathPhase + dt * breathRate) % 1;
    const ph = this.breathPhase;
    const sm3 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const breath = ph < 0.4 ? sm3(ph / 0.4) : 1 - sm3((ph - 0.4) / 0.6);
    this.setMorph('breathe', (speaking ? 0.35 : 0.5) + (speaking ? 0.35 : 0.5) * breath);

    // --- head: slow drift + attentive tilt while listening, bob with the speech, plus the expression's pose
    if (speaking && !this.wasSpeaking) this.nodNext = t + 0.15;
    this.wasSpeaking = speaking;
    if (speaking && t > this.nodNext) {
      this.nodUntil = t + 0.35;
      this.nodNext = t + 1.6 + Math.random() * 2.4;
    }
    const nod = t < this.nodUntil ? 2.4 : 0;
    const drift = (k: number, s: number): number => noise(t * k, s);
    // two layers: a slow sway (periods of 5-10 s) and a faint quicker tremor (1-2 s) - one slow noise alone reads
    // as a figure on a turntable; the head also follows the gaze a little, late (the eyes lead)
    const [gx0, gy0] = this.gazeForHead;
    let pitch = 1.0 * drift(0.17, 1) + 0.25 * drift(0.9, 11) + e * 4 + nod + (ex?.head.pitch ?? 0) - gy0 * 0.12;
    let yaw = 3.0 * drift(0.09, 2) + 0.4 * drift(0.7, 12) + (ex?.head.yaw ?? 0) + gx0 * 0.15;
    let roll = 2.0 * drift(0.13, 3) + 0.3 * drift(0.8, 13) + (ex?.head.roll ?? 0);
    if (mode === 'listening') roll += 3;
    if (mode === 'thinking') {
      pitch -= 4;
      roll -= 4;
      yaw += 3;
    }
    if (speaking) {
      // talking: the head keeps time with the words - small, quick, the stronger the louder
      yaw += 1.8 * drift(0.6, 4) * (0.5 + e);
      pitch += 1.2 * drift(0.8, 14) * (0.5 + e);
    }
    this.rotate(
      'head',
      this.headPitch.step(pitch * DEG, dt),
      this.headYaw.step(yaw * DEG, dt),
      this.headRoll.step(roll * DEG, dt),
    );
    // the body: a slow sway, and it rises a touch with each breath
    const sway = this.sway.step(0.7 * drift(0.11, 5), dt);
    this.rotate('body', (0.5 * drift(0.13, 15) - 0.35 * breath) * DEG, 0, (sway + 0.5 * drift(0.07, 6)) * DEG);

    // --- ears: occasional twitch; perked / flattened by the expression
    const ears = (ex?.ears ?? 0) + (mode === 'listening' ? 0.2 : 0) - (mode === 'thinking' ? 0.2 : 0);
    for (const [name, ear, side] of [['ear.L', this.earL, 1], ['ear.R', this.earR, -1]] as const) {
      if (t > ear.next) {
        ear.until = t + 0.12;
        ear.next = t + 3 + Math.random() * 8;
      }
      const twitch = t < ear.until ? Math.sin(Math.PI * Math.min(1, (t - (ear.until - 0.12)) / 0.12)) : 0;
      // flattened ears fold back (negative X) and turn outwards; perked ones come forward a little; at rest the
      // ears lean outwards a little, as the art draws them
      const fold = ears < 0 ? ears * 28 : ears * 8;
      const out = 10 + (ears < 0 ? -ears * 18 : 0);
      this.rotate(
        name,
        ear.fold.step((fold + twitch * 6) * DEG, dt),
        0,
        ear.flick.step(side * (out + twitch * 16 + 2 * drift(0.3, side + 9)) * DEG, dt),
      );
    }

    // --- tail tip: lazy swish away from the body, an occasional flick
    if (t > this.tailNext) {
      this.tailFlickUntil = t + 0.25;
      this.tailNext = t + 4 + Math.random() * 7;
    }
    const flick = this.tailFlick.step(t < this.tailFlickUntil ? 1 : 0, dt);
    this.updateLimbs(t, dt, speaking, e, breath, flick, drift);
  }

  /**
   * The paws, the feet and the tail. The forearms are cut free of the belly (avatar-bars/arms.py: the belly under
   * them and their undersides are modelled and painted), attached at the shoulders: they really lift. The hind
   * feet show their soles; their moves stay small.
   * Speech: one paw (alternating between phrases) keeps time with the loudness - it comes up and forward and tips
   * up on the stressed beats, like a hand while talking. A greeting: the first words after a silence of 20 s or
   * more come with a wave, the paw up by the cheek. Emotions: surprise brings both paws up by the cheeks, wow
   * halfway,
   * a laugh bounces them in front of the chest and kicks the feet, joy bobs them and wags the tail, thinking brings
   * one paw to the chin, anger presses them down and lashes the tail, sadness lets them droop.
   * Idle: now and then a paw pats the belly twice, the toes wiggle, the tail swishes.
   */
  private updateLimbs(t: number, dt: number, speaking: boolean, e: number, breath: number, flick: number,
    drift: (k: number, s: number) => number): void {
    const emo = this.emotionName?.() ?? 'calm';
    const S = this.limbS;
    const lift = [0.6 * breath, 0.6 * breath];      // the paws rise a hair with each breath
    const fwd = [0, 0];                             // the paw swung forward about the vertical (a low arm)
    const pitch = [0, 0];                           // the raised forearm tipped towards the viewer (about x)
    const paw = [0, 0];                             // the paw's tip up (degrees)
    const curl = [0, 0];                            // the paw curled towards the viewer
    const foot = [0, 0];                            // the toes up (negative) / down
    const spin = [0, 0];                            // the sole turned in its own plane
    let tailUp = 0;
    let wag = 1;                                    // the tail's swish amplitude (x)
    const sinT = (hz: number, ph = 0): number => Math.sin(2 * Math.PI * (hz * t + ph));
    // a greeting: the first words after a silence
    if (speaking && t - this.lastSpeechAt > 20) {
      this.waveAt = t;
      this.waveSide = Math.random() < 0.5 ? 0 : 1;
    }
    if (speaking) this.lastSpeechAt = t;
    // speech: one paw keeps time with the loudness; the other side takes over after a pause
    if (!speaking && t - this.lastSpeechAt > 0.6 && t - this.lastSpeechAt < 0.7) this.gestureSide = 1 - this.gestureSide;
    // (the wave's paw is not the talking one: stacked, the two sent the arm 100 deg up)
    const waving = t - this.waveAt >= 0 && t - this.waveAt < 2.2;
    if (waving && this.gestureSide === this.waveSide) this.gestureSide = 1 - this.waveSide;
    if (speaking) {
      const s = this.gestureSide;
      const k = Math.min(1, e * 2.2);
      lift[s] += 10 + 16 * k + 5 * drift(1.1, 42 + s);
      fwd[s] += 6 + 6 * k + 3 * drift(0.9, 44 + s);
      pitch[s] += 4 + 8 * k;
      paw[s] += 6 + 8 * k + 4 * drift(1.3, 40 + s);
      lift[1 - s] += 2 + 4 * k;
    }
    // emotions
    switch (emo) {
      case 'happy':
        lift[0] += 10 + 6 * Math.max(0, sinT(2.1));
        lift[1] += 10 + 6 * Math.max(0, sinT(2.1, 0.5));
        pitch[0] += 8;
        pitch[1] += 8;
        paw[0] += 4;
        paw[1] += 4;
        spin[0] += 5 * sinT(1.4);
        spin[1] -= 5 * sinT(1.4, 0.3);
        wag = 2.2;
        tailUp += 6;
        break;
      case 'laugh': {
        const bounce = Math.abs(sinT(2.6));
        lift[0] += 26 + 10 * bounce;
        lift[1] += 26 + 10 * bounce;
        pitch[0] += 12;
        pitch[1] += 12;
        paw[0] += 6;
        paw[1] += 6;
        foot[0] -= 6 * Math.max(0, sinT(1.6));
        foot[1] -= 6 * Math.max(0, sinT(1.6, 0.5));
        wag = 2.5;
        tailUp += 8;
        break;
      }
      case 'surprised':                             // both paws up in front of the chest
        lift[0] += 50;
        lift[1] += 50;
        pitch[0] += 26;
        pitch[1] += 26;
        foot[0] -= 5;
        foot[1] -= 5;
        tailUp += 10;
        wag = 0.4;
        break;
      case 'wow':
        lift[0] += 36;
        lift[1] += 36;
        pitch[0] += 18;
        pitch[1] += 18;
        paw[0] += 4;
        paw[1] += 4;
        curl[0] += 6;
        curl[1] += 6;
        tailUp += 6;
        break;
      case 'angry':
        lift[0] -= 2.5;
        lift[1] -= 2.5;
        curl[0] += 10;
        curl[1] += 10;
        wag = 0.6;
        tailUp -= 4;
        break;
      case 'sad':
        lift[0] -= 3;
        lift[1] -= 3;
        paw[0] -= 5;
        paw[1] -= 5;
        wag = 0.3;
        tailUp -= 6;
        break;
      case 'thinking':                              // one paw up at the chest, tapping
        lift[1] += 46;
        pitch[1] += 30;
        fwd[1] -= 10;
        paw[1] += 4 * Math.max(0, sinT(0.9));
        wag = 0.6;
        break;
      case 'smug':
        lift[0] += 6;
        paw[0] += 6 * Math.max(0, sinT(0.8));
        wag = 0.8;
        break;
      default:
        break;
    }
    // the wave: the paw up in front of the shoulder, waving three times, then down (2.2 s)
    const wt = t - this.waveAt;
    if (waving) {
      const env = Math.min(1, wt / 0.4) * Math.min(1, (2.2 - wt) / 0.5);
      const s = this.waveSide;
      const sw = Math.sin(2 * Math.PI * 1.8 * Math.max(0, wt - 0.3));
      lift[s] += env * (46 + 3 * sw);
      pitch[s] += 24 * env;
      paw[s] += env * 20 * sw;
    }
    // idle: a paw pats the belly twice now and then; the toes wiggle
    if (!speaking && emo === 'calm' && t > this.fidgetNext) {
      this.fidgetAt = t;
      this.fidgetSide = Math.random() < 0.5 ? 0 : 1;
      this.fidgetNext = t + 7 + Math.random() * 9;
    }
    const ft = t - this.fidgetAt;
    if (ft >= 0 && ft < 0.9) {
      const pat = Math.max(0, Math.sin(2 * Math.PI * ft / 0.45));
      curl[this.fidgetSide] += 6 * pat;
      lift[this.fidgetSide] += 7 * pat;
    }
    if (t > this.wiggleNext) {
      this.wiggleAt = t;
      this.wiggleNext = t + 9 + Math.random() * 10;
    }
    const wg = t - this.wiggleAt;
    if (wg >= 0 && wg < 0.8) {
      const k = Math.sin(Math.PI * wg / 0.8);
      foot[0] -= 5 * k * Math.max(0, Math.sin(2 * Math.PI * wg / 0.4));
      foot[1] -= 5 * k * Math.max(0, Math.sin(2 * Math.PI * (wg / 0.4 + 0.5)));
    }
    // pose (the left limbs at +x, on the viewer's right): a lift is a turn about the axis to the viewer through the
    // shoulder, opposite for the two sides; then the pitch tips the raised forearm towards the viewer (about x, the
    // same for both) - a raised paw comes up in front of the chest; forward swings a low paw about the vertical
    // (on a raised one that laid the forearm flat against the cheek, twisted, and the paw bent at the wrist read
    // as a crooked arm). (Never below the rest: the forearm lies on the thigh.) The forearm is cut free of the belly
    // and turns about its fold deep in the pocket: up to ~55 deg it stays one round pillow; higher its base pinched
    // into a neck under a lump and the pocket opened as a dark hole at the armpit - so every sum is capped.
    const D = DEG;
    for (const s of [0, 1]) {
      lift[s] = Math.min(52, Math.max(-2, lift[s]));
      pitch[s] = Math.min(32, pitch[s]);
    }
    this.rotate('arm.L', S.pitchL.step(pitch[0], dt) * D, S.fwdL.step(fwd[0], dt) * D, -S.liftL.step(lift[0], dt) * D);
    this.rotate('arm.R', S.pitchR.step(pitch[1], dt) * D, -S.fwdR.step(fwd[1], dt) * D, S.liftR.step(lift[1], dt) * D);
    this.rotate('paw.L', 0, S.curlL.step(curl[0], dt) * D, -S.pawL.step(paw[0], dt) * D);
    this.rotate('paw.R', 0, -S.curlR.step(curl[1], dt) * D, S.pawR.step(paw[1], dt) * D);
    this.rotate('foot.L', S.footL.step(foot[0], dt) * D, 0, S.spinL.step(spin[0], dt) * D);
    this.rotate('foot.R', S.footR.step(foot[1], dt) * D, 0, -S.spinR.step(spin[1], dt) * D);
    const w = S.tailWag.step(wag, dt);
    const swish = 7 + w * (6 * Math.sin(t * Math.PI * 2 * (0.13 + 0.25 * Math.max(0, w - 1))) + 3 * drift(0.4, 16))
      + flick * 12;
    this.rotate('tail', (2 * drift(0.3, 17) - S.tailUp.step(tailUp, dt)) * DEG, swish * DEG, -flick * 6 * DEG);
  }

  /**
   * Real eyes: ARKit-style weights → lid elevations (degrees above / below the forward axis) and a lid tilt, posed
   * on the lid bones; a blink is a timeline (close 80 ms, hold 40 ms, open 140 ms) on top; gaze on the eye bones.
   */
  private updateEyes3d(t: number, dt: number, f: Record<string, number>): void {
    const g = (n: string): number => f[n] ?? 0;
    const c01 = (v: number): number => Math.min(1, Math.max(0, v));
    const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    if (this.blinkStart < 0 && t > this.blinkNext3d) {
      this.blinkStart = t;
      // every 3-6 s; one in six a quick double blink (the second one 0.3 s after the first); no two alike: the
      // close 120-165 ms, the lift 230-320 ms
      this.blinkNext3d = t + (Math.random() < 0.17 ? 0.3 : 3 + Math.random() * 3);
      this.blinkClose = 0.12 + Math.random() * 0.045;
      this.blinkOpen = 0.23 + Math.random() * 0.09;
    }
    let blink = 0;
    if (this.blinkStart >= 0) {
      // the lid's own timing, measured on real blinks: a soft start, a fast middle and a soft landing on the way
      // down (cubic in / quartic out — a quintic start held the lid still, then snapped it), a 50 ms hold, and a
      // slower lift that eases out (not so sharply that the lid pops open and creeps) — never the constant speed
      // of a curtain; a plush face blinks a little slower than a human one
      const u = t - this.blinkStart;
      const lidDown = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
      const lidUp = (x: number): number => 1 - Math.pow(1 - x, 2.3);
      const c = this.blinkClose;
      const o = this.blinkOpen;
      if (u < c) blink = lidDown(u / c);
      else if (u < c + 0.05) blink = 1;
      else if (u < c + 0.05 + o) blink = 1 - lidUp((u - c - 0.05) / o);
      else this.blinkStart = -1;
    }
    blink = Math.max(blink, this.forceBlink);
    // a blink is the upper lid's: the lower one follows late (its share the blink's curve to the 1.8th power - it
    // meets the upper lid as that lands) and lets go first on the way up
    const blinkLo = Math.pow(blink, 1.8);
    const [UP, LO] = this.lidOpen;
    for (const [side, S, sign] of [['L', 'Left', 1], ['R', 'Right', -1]] as const) {
      const eb = g(`eyeBlink${S}`);
      const sq = g(`eyeSquint${S}`);
      const cs = g(`cheekSquint${S}`);
      const wd = g(`eyeWide${S}`);
      const bd = g(`browDown${S}`);
      const bi = g('browInnerUp');
      const upperClose = c01(eb + sq * 0.35 + cs * 0.5 + bd * 0.25 + bi * 0.15);
      const lowerClose = c01(eb * 0.55 + sq * 0.8 + cs * 0.7);
      const happyArc = cs * eb;   // '^^': closed lids meeting in an arc above the centre
      if (this.lidMorphs) {
        // the face's own lids: how far down the opening the upper rim has come (1 = to the bottom) and how far up
        // the lower one (both closing meet 43% up); a blink sweeps the upper rim down to the lower one
        // the expression's lids, smoothed; the blink on top of them unsmoothed (its own easing: a crisp 80 ms close)
        // the build's lidUp carries the upper rim as one arc down to the shut line (the lower rim lifted a little);
        // lidLo lifts the lower rim to that line. A blink is lidUp -> 1 (with a touch past it, OVER, so the upper
        // lid lies over the lower: one thin line) and lidLo -> 1
        // (the expressions' lids were tuned when a full upperClose carried the rim 57 % of the way and lowerClose
        // 43 %: the same looks on the new keys, where 1 is the shut line)
        // (the shut line is the lower rim lifted 30 mm: the upper rim's full travel is shorter than before, so
        // the expressions' squints are scaled up to keep their look; in a blink both rims go to the line together)
        const OVER = 0.04;
        let lo = this.lidLo[side].step(lowerClose * 0.45, dt);
        let up = this.lidUp[side].step(upperClose * 0.78, dt);
        lo += (1 - lo) * blinkLo;
        up += (1 + OVER - up) * blink;
        // the laugh's closed '^^' is its own key: it takes over from the plain closing as it comes in
        const sh = this.lidArch[side].step(happyArc, dt);
        const su = up * (1 - sh);
        const sl = lo * (1 - sh);
        this.setMorph(`lidUp.${side}`, su);
        this.setMorph(`lidLo.${side}`, sl);
        this.setMorph(`lidHappy.${side}`, sh);
        // corrective keys: half-way along their straight paths the rims would sink into the eyeball
        this.setMorph(`lidUpMid.${side}`, Math.max(0, 4 * su * (1 - su)));
        this.setMorph(`lidLoMid.${side}`, 4 * sl * (1 - sl));
        this.setMorph(`lidHappyMid.${side}`, 4 * sh * (1 - sh));
        // (the glints sit on the eyeball above the pupil: the upper lid covers them well before it is shut)
        const shut = su > 0.3 || sh > 0.4;
        for (const gl of this.glints[side]) gl.visible = !shut;
        // under a closing lid the eye goes dark: where the rims meet no white line of sclera shows through (only
        // right at the closure: earlier, the sclera went grey while the lid was still sweeping down)
        const dim = ease((Math.max(su, sh) - 0.9) / 0.08);
        this.eyeMats[side]?.color.setScalar(1 - 0.92 * dim);
        this.setMorph(`lidTilt.${side}`, this.lidTilt[side].step(Math.max(-1, Math.min(1, bd - 0.6 * bi)), dt));
        this.setMorph(`lidWide.${side}`, wd);
        continue;
      }
      // the resting eye already is the art's open one: 'wide' only opens it a little more (any more and the upper
      // liner would slide under the fur rim)
      let eU = UP * (1 - upperClose) - 6 * upperClose + 3 * wd + 16 * happyArc;
      let eL = -LO * (1 - lowerClose) - 6 * lowerClose - 4 * wd + 16 * happyArc;
      // the blink sweeps the upper lid down to the lower one, which rises a little to meet it
      eL = eL + (-8 - eL) * blink * 0.4;
      eU = eU + (eL - 1 - eU) * blink;
      const tilt = sign * (14 * bd - 10 * bi);   // angry: inner corner down; sad: inner corner up
      const u = this.lidUp[side].step(eU, dt);
      const l = this.lidLo[side].step(eL, dt);
      const tl = this.lidTilt[side].step(tilt, dt);
      // the lids are built tilted (outer corner up): they open and close about their own tilted axis
      this.poseLid(`lidU.${side}`, (UP - u) * DEG, tl * DEG, sign * this.lidBakedTilt * DEG);
      this.poseLid(`lidL.${side}`, (-LO - l) * DEG, tl * 0.4 * DEG, sign * this.lidBakedTilt * DEG);
    }
    // gaze: the expression's look direction plus saccades - a quick jump to a new fixation every 1-4 s, mostly
    // small and near the centre (the viewer), a slow drift between them, and a blink often rides along with a jump
    if (t > this.saccNext) {
      this.saccNext = t + 1 + Math.random() * 3;
      const big = Math.random() < 0.25;
      this.saccX = (Math.random() - 0.5) * (big ? 9 : 3);
      this.saccY = (Math.random() - 0.5) * (big ? 5 : 2);
      if (big && this.blinkStart < 0 && Math.random() < 0.5) this.blinkStart = t;
    }
    const lookUp = (g('eyeLookUpLeft') + g('eyeLookUpRight')) / 2 - (g('eyeLookDownLeft') + g('eyeLookDownRight')) / 2;
    const lookOutL = g('eyeLookOutLeft') - g('eyeLookInLeft');
    const driftX = 0.8 * noise(t * 0.35, 21);
    const driftY = 0.5 * noise(t * 0.3, 22);
    const gx = this.gazeX.step(this.saccX + driftX + lookOutL * 8, dt);
    const gy = this.gazeY.step(this.saccY + driftY + lookUp * 9, dt);
    this.gazeForHead = [gx, gy];
    // the eyes glance down a touch as the lids close (the animator's blink: the eye follows the lid)
    const gyB = gy - 4 * blink;
    this.rotate('eye.L', -gyB * DEG * this.gazeK, gx * DEG * this.gazeK, 0);
    this.rotate('eye.R', -gyB * DEG * this.gazeK, gx * DEG * this.gazeK, 0);
  }

  /** ARKit-style face weights → the leopard's eye shader. Its own resting look keeps the eyes closed ("‿"). */
  private updateEyes(t: number, dt: number, f: Record<string, number>, rest: number): void {
    if (!this.eyes) return;
    const g = (n: string): number => f[n] ?? 0;
    // natural blinks while the eyes are open
    if (t > this.blinkNext) {
      this.blinkAt = t;
      this.blinkNext = t + 2.2 + Math.random() * 3.5;
    }
    const bt = (t - this.blinkAt) / 0.16;
    const blink = bt >= 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0;
    const k = 1 - Math.exp(-dt * 9);   // eyes ease into a new expression (~0.3 s)
    const sides = [['Left', this.eyeL], ['Right', this.eyeR]] as const;
    for (const [s, p] of sides) {
      const happy = Math.min(1, g(`cheekSquint${s}`) * 1.3);
      const closed = Math.max(g(`eyeBlink${s}`), rest * this.restEyesClosed);
      const target: EyeParams = {
        open: 1 - closed,
        wide: g(`eyeWide${s}`),
        squint: Math.max(g(`eyeSquint${s}`), happy * 0.5),
        tilt: g(`browDown${s}`) - g('browInnerUp') * 0.45,
        happy: happy > 0.5 ? 1 : happy * 1.2,
        lookX: g(`eyeLookOut${s}`) - g(`eyeLookIn${s}`),
        lookY: g(`eyeLookUp${s}`) - g(`eyeLookDown${s}`),
        browAlpha: Math.min(1, g(`browDown${s}`) + g('browInnerUp') * 0.6 + g(`browOuterUp${s}`) * 0.5) * 0.9,
        browRaise: g(`browOuterUp${s}`) + g('browInnerUp') * 0.5 - g(`browDown${s}`) * 0.6,
        browTilt: g(`browDown${s}`) * 0.55 - g('browInnerUp') * 0.45,
      };
      for (const key of Object.keys(target) as (keyof EyeParams)[]) p[key] += (target[key] - p[key]) * k;
    }
    const withBlink = (p: EyeParams): EyeParams => ({ ...p, open: p.open * (1 - blink) });
    setEyes(this.eyes, withBlink(this.eyeL), withBlink(this.eyeR));
  }
}

const DEMO_SEQ = ['viseme_aa', 'viseme_nn', 'viseme_O', 'viseme_sil', 'viseme_E', 'viseme_DD', 'viseme_aa', 'viseme_PP',
  'viseme_I', 'viseme_U', 'viseme_kk', 'viseme_aa', 'viseme_sil', 'viseme_sil'];

/** Fake "speech": 2.6 s of syllables, then 1.4 s of listening. */
function demoFrame(t: number): { visemes: Record<string, number>; mode: Mode } {
  const cycle = t % 4;
  if (cycle > 2.6) return { visemes: { viseme_sil: 1 }, mode: 'listening' };
  const k = cycle / 0.11;
  const a = DEMO_SEQ[Math.floor(k) % DEMO_SEQ.length];
  const b = DEMO_SEQ[(Math.floor(k) + 1) % DEMO_SEQ.length];
  const f = k - Math.floor(k);
  return { visemes: { [a]: 1 - f, [b]: f }, mode: 'speaking' };
}

/** Body material: keep the colour/normal/roughness maps, drop metalness, add a soft sheen. */
function furMaterial(src: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const textured = !!src.map;
  const m = new THREE.MeshPhysicalMaterial({
    name: 'Body',
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    normalScale: src.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    roughnessMap: src.roughnessMap ?? null,
    // matte soft-touch clay, like the reference renders: rough, a weak specular, no sheen
    roughness: src.roughnessMap ? 1 : 0.82,
    metalness: 0,
    specularIntensity: 0.35,
    color: 0xffffff,
    vertexColors: !textured,
    envMapIntensity: 0.6,
  });
  return m;
}

/** Soft warm-white studio backdrop (screen-space), like the concept art. */
function backdropTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d')!;
  // grey seamless studio like the user's renders: darker wall, lighter floor
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#b4b4b4');
  grad.addColorStop(0.5, '#c2c2c2');
  grad.addColorStop(0.62, '#d4d4d4');
  grad.addColorStop(1, '#e4e4e4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Radial falloff used as a soft contact shadow under the figure. */
function contactShadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
